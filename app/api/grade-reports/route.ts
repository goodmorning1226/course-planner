import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { courseInfoQuerySchema, gradeReportBodySchema, gradeReportDeleteSchema } from "@/lib/validations";
import { matchKey } from "@/lib/reviews/key";
import { buildSemester, reconstruct, groupReports, legacyToReports, type RawReport, type LegacyBuckets } from "@/lib/grades/reports";
import { logContent } from "@/lib/audit";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";

// 成績分布 A 版. A report is private (reveals the reporter's grade), so the
// public response is the RECONSTRUCTED aggregate only (no per-person data),
// combining first-hand user reports with the converted imported distributions
// (grade_distributions). The viewer additionally gets back their OWN reports so
// the form can prefill for editing.

interface ReportRow {
  semester: string;
  pivot: string;
  same_pct: number | null;
  above_pct: number | null;
  below_pct: number | null;
  user_id: string;
}
interface LegacyRow extends LegacyBuckets {
  semester: string;
}

export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-read"), RATE_LIMITS.reviewRead.limit, RATE_LIMITS.reviewRead.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const { searchParams } = new URL(req.url);
  const parsed = courseInfoQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return apiError("invalid_request", "查詢參數不合法。");
  const key = matchKey(parsed.data.name, parsed.data.teacher ?? null);

  try {
    const session = createServerSupabaseClient();
    const { data: { user } } = await session.auth.getUser();

    const svc = createServiceRoleClient();
    const [reportsR, legacyR] = await Promise.all([
      svc.from("grade_reports")
        .select("semester, pivot, same_pct, above_pct, below_pct, user_id")
        .eq("match_key", key)
        .order("created_at", { ascending: true }), // oldest→newest for deterministic grouping
      svc.from("grade_distributions")
        .select("semester, a_plus, a, a_minus, b_plus, b, b_minus, c_plus, c, c_minus, f")
        .eq("match_key", key),
    ]);
    if (reportsR.error) throw reportsR.error;
    if (legacyR.error) throw legacyR.error;
    const rows = (reportsR.data ?? []) as ReportRow[];
    const legacyRows = (legacyR.data ?? []) as LegacyRow[];

    // First-hand user reports per semester.
    const reportsBySem = new Map<string, RawReport[]>();
    for (const r of rows) {
      const rep: RawReport = { pivot: r.pivot, same_pct: r.same_pct, above_pct: r.above_pct, below_pct: r.below_pct };
      const arr = reportsBySem.get(r.semester);
      if (arr) arr.push(rep);
      else reportsBySem.set(r.semester, [rep]);
    }
    // Imported legacy buckets per semester (one row per semester).
    const legacyBySem = new Map<string, LegacyBuckets>();
    for (const l of legacyRows) {
      const { semester, ...buckets } = l;
      legacyBySem.set(semester, buckets);
    }

    const allSemesters = new Set<string>([...reportsBySem.keys(), ...legacyBySem.keys()]);
    const semesters = [...allSemesters]
      .map((semester) => ({
        semester,
        ...buildSemester(reportsBySem.get(semester) ?? [], legacyBySem.get(semester) ?? null),
      }))
      .filter((s) => s.bars.length > 0)
      .sort((a, b) => (a.semester < b.semester ? 1 : -1)); // newest first

    // The viewer's own reports, keyed by semester (for prefill/edit).
    const myReports: Record<string, { pivot: string; samePct: number | null; abovePct: number | null; belowPct: number | null }> = {};
    if (user) {
      for (const r of rows) {
        if (r.user_id === user.id) {
          myReports[r.semester] = { pivot: r.pivot, samePct: r.same_pct, abovePct: r.above_pct, belowPct: r.below_pct };
        }
      }
    }

    return NextResponse.json({ semesters, myReports });
  } catch (err) {
    console.error("[/api/grade-reports GET] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-write"), RATE_LIMITS.reviewWrite.limit, RATE_LIMITS.reviewWrite.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  const parsed = gradeReportBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_request", parsed.error.issues[0]?.message ?? "請求內容不合法。");
  const b = parsed.data;

  try {
    const svc = createServiceRoleClient();
    const key = matchKey(b.courseName, b.teacher ?? null);

    // Warn only when this report can't join ANY existing branch — i.e. it
    // contradicts EVERY branch built from other users' reports + the imported
    // legacy distribution, so it would open a brand-new divergent bar. If it's
    // compatible with at least one branch it just merges (no warning). Saving is
    // still allowed via force; the client confirms first.
    if (!b.force) {
      const numOrNull = (v: unknown) => (v == null ? null : Number(v));
      const [othersR, legacyR] = await Promise.all([
        svc.from("grade_reports")
          .select("pivot, same_pct, above_pct, below_pct")
          .eq("match_key", key)
          .eq("semester", b.semester)
          .neq("user_id", user.id)
          .order("created_at", { ascending: true }),
        svc.from("grade_distributions")
          .select("a_plus, a, a_minus, b_plus, b, b_minus, c_plus, c, c_minus, f")
          .eq("match_key", key)
          .eq("semester", b.semester)
          .maybeSingle(),
      ]);
      const others = (othersR.data ?? []) as { pivot: string; same_pct: unknown; above_pct: unknown; below_pct: unknown }[];
      const legacyReports = legacyR.data
        ? legacyToReports(Object.fromEntries(
            Object.entries(legacyR.data).map(([k, v]) => [k, numOrNull(v)]),
          ) as unknown as LegacyBuckets).reports
        : [];
      const existing: RawReport[] = [
        ...legacyReports,
        ...others.map((o) => ({
          pivot: o.pivot,
          same_pct: numOrNull(o.same_pct),
          above_pct: numOrNull(o.above_pct),
          below_pct: numOrNull(o.below_pct),
        })),
      ];
      const newReport: RawReport = {
        pivot: b.pivot, same_pct: b.samePct, above_pct: b.abovePct ?? null, below_pct: b.belowPct ?? null,
      };
      const branches = groupReports(existing);
      const conflictsAll = branches.length > 0 && branches.every((br) => reconstruct([...br, newReport]).conflict);
      if (conflictsAll) {
        return NextResponse.json({ conflict: true });
      }
    }

    // One report per user per COURSE: match on (user_id, match_key) only, so a
    // resubmit for a different semester updates (moves) the user's single report.
    const { data: existing } = await svc
      .from("grade_reports")
      .select("id")
      .eq("user_id", user.id)
      .eq("match_key", key)
      .maybeSingle();
    const row = {
      user_id: user.id,
      course_name: b.courseName,
      teacher: b.teacher ?? null,
      match_key: key,
      semester: b.semester,
      pivot: b.pivot,
      same_pct: b.samePct,
      above_pct: b.abovePct ?? null,
      below_pct: b.belowPct ?? null,
    };
    const { error } = existing
      ? await svc.from("grade_reports").update(row).eq("id", existing.id)
      : await svc.from("grade_reports").insert(row);
    if (error) throw error;
    await logContent({
      kind: "grade",
      action: existing ? "edit" : "add",
      courseName: b.courseName,
      teacher: b.teacher ?? null,
      semester: b.semester,
      userId: user.id,
      detail: { pivot: b.pivot, same: b.samePct, above: b.abovePct ?? null, below: b.belowPct ?? null },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/grade-reports POST] failed:", err);
    return apiError("internal_error", "儲存失敗，請稍後再試。");
  }
}

export async function DELETE(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-write"), RATE_LIMITS.reviewWrite.limit, RATE_LIMITS.reviewWrite.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  const parsed = gradeReportDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_request", parsed.error.issues[0]?.message ?? "請求內容不合法。");
  const b = parsed.data;

  try {
    const svc = createServiceRoleClient();
    const key = matchKey(b.courseName, b.teacher ?? null);
    // Scope by user_id so a viewer can only remove their OWN report.
    const { error } = await svc
      .from("grade_reports")
      .delete()
      .eq("user_id", user.id)
      .eq("match_key", key)
      .eq("semester", b.semester);
    if (error) throw error;
    await logContent({
      kind: "grade",
      action: "delete",
      courseName: b.courseName,
      teacher: b.teacher ?? null,
      semester: b.semester,
      userId: user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/grade-reports DELETE] failed:", err);
    return apiError("internal_error", "刪除失敗，請稍後再試。");
  }
}

import { NextResponse } from "next/server";
import { createPublicServerClient, createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { courseInfoQuerySchema, gradeBodySchema } from "@/lib/validations";
import { matchKey } from "@/lib/reviews/key";
import { logContent } from "@/lib/audit";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";
import type { GradeBody } from "@/lib/validations";
import type { GradeDistribution } from "@/lib/courses/types";

// GET /api/grades?name=&teacher= — public: all-semester grade distributions.
// POST — logged-in user adds a NEW semester. PUT — any logged-in user edits an
// existing one (distributions belong to the course, not the submitter).

const buckets = (b: GradeBody) => ({
  a_plus: b.aPlus ?? null, a: b.a ?? null, a_minus: b.aMinus ?? null,
  b_plus: b.bPlus ?? null, b: b.b ?? null, b_minus: b.bMinus ?? null,
  c_plus: b.cPlus ?? null, c: b.c ?? null, c_minus: b.cMinus ?? null,
  f: b.f ?? null,
});

export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-read"), RATE_LIMITS.reviewRead.limit, RATE_LIMITS.reviewRead.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const { searchParams } = new URL(req.url);
  const parsed = courseInfoQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return apiError("invalid_request", "查詢參數不合法。");
  const key = matchKey(parsed.data.name, parsed.data.teacher ?? null);

  try {
    const supabase = createPublicServerClient();
    const { data, error } = await supabase
      .from("grade_distributions")
      .select("id, course_name, teacher, semester, a_plus, a, a_minus, b_plus, b, b_minus, c_plus, c, c_minus, f, source")
      .eq("match_key", key)
      .order("semester", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ distributions: (data ?? []) as GradeDistribution[] });
  } catch (err) {
    console.error("[/api/grades GET] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-write"), RATE_LIMITS.reviewWrite.limit, RATE_LIMITS.reviewWrite.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  const parsed = gradeBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_request", parsed.error.issues[0]?.message ?? "請求內容不合法。");
  const b = parsed.data;

  try {
    const svc = createServiceRoleClient();
    const key = matchKey(b.courseName, b.teacher ?? null);
    // A semester that already has a distribution is added once — edit it via PUT.
    const { data: existing } = await svc.from("grade_distributions").select("id").eq("match_key", key).eq("semester", b.semester).maybeSingle();
    if (existing) return apiError("invalid_request", "該學期已有成績分布，請改用編輯。");
    const { error } = await svc.from("grade_distributions").insert({
      course_name: b.courseName,
      teacher: b.teacher ?? null,
      match_key: key,
      semester: b.semester,
      ...buckets(b),
      note: null,
      source: "user",
      submitted_by: user.id,
    });
    if (error) throw error;
    await logContent({ kind: "grade", action: "add", courseName: b.courseName, teacher: b.teacher ?? null, semester: b.semester, userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/grades POST] failed:", err);
    return apiError("internal_error", "儲存失敗，請稍後再試。");
  }
}

export async function PUT(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-write"), RATE_LIMITS.reviewWrite.limit, RATE_LIMITS.reviewWrite.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  const parsed = gradeBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_request", parsed.error.issues[0]?.message ?? "請求內容不合法。");
  const b = parsed.data;

  try {
    const svc = createServiceRoleClient();
    const key = matchKey(b.courseName, b.teacher ?? null);
    // Any logged-in user may edit — the distribution belongs to the course.
    const { data: existing } = await svc.from("grade_distributions").select("id").eq("match_key", key).eq("semester", b.semester).maybeSingle();
    if (!existing) return apiError("invalid_request", "找不到要編輯的成績分布。");
    const { error } = await svc.from("grade_distributions").update({ ...buckets(b), note: null }).eq("id", existing.id);
    if (error) throw error;
    await logContent({ kind: "grade", action: "edit", courseName: b.courseName, teacher: b.teacher ?? null, semester: b.semester, userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/grades PUT] failed:", err);
    return apiError("internal_error", "儲存失敗，請稍後再試。");
  }
}

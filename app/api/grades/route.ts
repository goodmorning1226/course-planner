import { NextResponse } from "next/server";
import { createPublicServerClient, createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { courseInfoQuerySchema, gradeBodySchema } from "@/lib/validations";
import { matchKey } from "@/lib/reviews/key";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";
import type { GradeDistribution } from "@/lib/courses/types";

// GET /api/grades?name=&teacher= — public: all-semester grade distributions for
// a course identity. POST — logged-in user submits/edits one (service-role write).

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
      .select("id, course_name, teacher, semester, a_plus, a, a_minus, b_plus, b, b_minus, c_plus, c, c_minus, f, note, source")
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

  const body = await req.json().catch(() => null);
  const parsed = gradeBodySchema.safeParse(body);
  if (!parsed.success) return apiError("invalid_request", parsed.error.issues[0]?.message ?? "請求內容不合法。");
  const b = parsed.data;

  try {
    const svc = createServiceRoleClient();
    const key = matchKey(b.courseName, b.teacher ?? null);
    // A semester that already has a distribution is locked — no overwriting.
    const { data: existing } = await svc
      .from("grade_distributions")
      .select("id")
      .eq("match_key", key)
      .eq("semester", b.semester)
      .maybeSingle();
    if (existing) return apiError("invalid_request", "該學期已有成績分布，無法重複新增。");
    const { error } = await svc.from("grade_distributions").insert({
      course_name: b.courseName,
      teacher: b.teacher ?? null,
      match_key: key,
      semester: b.semester,
      a_plus: b.aPlus ?? null, a: b.a ?? null, a_minus: b.aMinus ?? null,
      b_plus: b.bPlus ?? null, b: b.b ?? null, b_minus: b.bMinus ?? null,
      c_plus: b.cPlus ?? null, c: b.c ?? null, c_minus: b.cMinus ?? null,
      f: b.f ?? null,
      note: b.note?.trim() ? b.note.trim() : null,
      source: "user",
      submitted_by: user.id,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/grades POST] failed:", err);
    return apiError("internal_error", "儲存失敗，請稍後再試。");
  }
}

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getFavoriteCourses } from "@/lib/courses/favorites";
import { timetableCourseBodySchema } from "@/lib/validations";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";

// GET    /api/favorites              — the caller's favorited courses (full).
// POST   /api/favorites { courseId } — add a favorite.
// DELETE /api/favorites { courseId } — remove a favorite.
// All require a session; RLS enforces per-user ownership.

async function requireUser() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req, "timetable-read"), RATE_LIMITS.timetableRead.limit, RATE_LIMITS.timetableRead.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const { supabase, user } = await requireUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  try {
    const courses = await getFavoriteCourses(supabase, user.id);
    return NextResponse.json({ courses });
  } catch (err) {
    console.error("[/api/favorites GET] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "timetable-write"), RATE_LIMITS.timetableWrite.limit, RATE_LIMITS.timetableWrite.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const { supabase, user } = await requireUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  const parsed = timetableCourseBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_request", "請求內容不合法。");

  try {
    // Idempotent add — the (user_id, course_id) PK + ignoreDuplicates make a
    // repeat favorite a no-op.
    const { error } = await supabase
      .from("course_favorites")
      .upsert({ user_id: user.id, course_id: parsed.data.courseId }, { onConflict: "user_id,course_id", ignoreDuplicates: true });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/favorites POST] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

export async function DELETE(req: Request) {
  const rl = rateLimit(clientKey(req, "timetable-write"), RATE_LIMITS.timetableWrite.limit, RATE_LIMITS.timetableWrite.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const { supabase, user } = await requireUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  const parsed = timetableCourseBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_request", "請求內容不合法。");

  try {
    const { error } = await supabase
      .from("course_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("course_id", parsed.data.courseId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/favorites DELETE] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

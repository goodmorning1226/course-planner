import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getOrCreateDefaultTimetable } from "@/lib/timetable/cloud";
import { timetableCourseBodySchema } from "@/lib/validations";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";

// POST   /api/timetable/courses  body { courseId } — add to my timetable.
// DELETE /api/timetable/courses  body { courseId } — remove from my timetable.
// Both require a session; RLS also enforces that the timetable belongs to the
// user (insert/delete policies check ownership of the parent timetable).

async function requireUser() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

async function parseBody(req: Request) {
  const body = await req.json().catch(() => null);
  return timetableCourseBodySchema.safeParse(body);
}

export async function POST(req: Request) {
  const rl = rateLimit(
    clientKey(req, "timetable-write"),
    RATE_LIMITS.timetableWrite.limit,
    RATE_LIMITS.timetableWrite.windowMs
  );
  if (!rl.ok) return rateLimited(rl.resetAt);

  const { supabase, user } = await requireUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  const parsed = await parseBody(req);
  if (!parsed.success) return apiError("invalid_request", "請求內容不合法。");

  try {
    const timetableId = await getOrCreateDefaultTimetable(supabase, user.id);
    // Idempotent add: the (timetable_id, course_id) unique constraint plus
    // ignoreDuplicates means re-adding the same course is a no-op.
    const { error } = await supabase
      .from("timetable_courses")
      .upsert(
        { timetable_id: timetableId, course_id: parsed.data.courseId },
        { onConflict: "timetable_id,course_id", ignoreDuplicates: true }
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/timetable/courses POST] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

export async function DELETE(req: Request) {
  const rl = rateLimit(
    clientKey(req, "timetable-write"),
    RATE_LIMITS.timetableWrite.limit,
    RATE_LIMITS.timetableWrite.windowMs
  );
  if (!rl.ok) return rateLimited(rl.resetAt);

  const { supabase, user } = await requireUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  const parsed = await parseBody(req);
  if (!parsed.success) return apiError("invalid_request", "請求內容不合法。");

  try {
    const timetableId = await getOrCreateDefaultTimetable(supabase, user.id);
    const { error } = await supabase
      .from("timetable_courses")
      .delete()
      .eq("timetable_id", timetableId)
      .eq("course_id", parsed.data.courseId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/timetable/courses DELETE] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

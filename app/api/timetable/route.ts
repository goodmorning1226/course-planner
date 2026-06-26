import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  getOrCreateDefaultTimetable,
  getTimetableCourses,
} from "@/lib/timetable/cloud";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";

// GET /api/timetable — the logged-in user's timetable + its courses.
// Creates a default timetable on first access. RLS guarantees per-user access.
export async function GET(req: Request) {
  const rl = rateLimit(
    clientKey(req, "timetable-read"),
    RATE_LIMITS.timetableRead.limit,
    RATE_LIMITS.timetableRead.windowMs
  );
  if (!rl.ok) return rateLimited(rl.resetAt);

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return apiError("unauthorized", "請先登入。");
  }

  try {
    const timetableId = await getOrCreateDefaultTimetable(supabase, user.id);
    const courses = await getTimetableCourses(supabase, timetableId);
    return NextResponse.json({ timetableId, courses });
  } catch (err) {
    console.error("[/api/timetable] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

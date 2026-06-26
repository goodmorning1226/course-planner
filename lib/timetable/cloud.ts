// Server-side helpers for the cloud timetable. Uses a request-scoped Supabase
// client (anon key + user cookies), so every query is constrained by RLS — a
// user can only ever touch their own timetable.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseWithSessions } from "@/lib/courses/types";

const DEFAULT_NAME = "我的暫排課表";
const SEMESTER = "115-1";

/**
 * Return the id of the user's default timetable, creating one if none exists.
 * `supabase` must be a user-scoped client (RLS ensures ownership).
 */
export async function getOrCreateDefaultTimetable(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: existing, error: selErr } = await supabase
    .from("user_timetables")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing.id as string;

  const { data: created, error: insErr } = await supabase
    .from("user_timetables")
    .insert({ user_id: userId, name: DEFAULT_NAME, semester: SEMESTER })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return created.id as string;
}

/** Load all courses (with sessions) in a timetable as CourseWithSessions[]. */
export async function getTimetableCourses(
  supabase: SupabaseClient,
  timetableId: string
): Promise<CourseWithSessions[]> {
  const { data, error } = await supabase
    .from("timetable_courses")
    .select("course_id, courses(*, course_sessions(*))")
    .eq("timetable_id", timetableId);
  if (error) throw error;

  const courses: CourseWithSessions[] = [];
  for (const row of data ?? []) {
    // `courses` is a to-one embed; `course_sessions` a to-many embed.
    const c = row.courses as unknown as
      | (CourseWithSessions & { course_sessions?: CourseWithSessions["sessions"] })
      | null;
    if (!c) continue;
    const { course_sessions, ...course } = c;
    courses.push({ ...(course as CourseWithSessions), sessions: course_sessions ?? [] });
  }
  return courses;
}

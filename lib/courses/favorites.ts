// Server-side helpers for course favorites. Uses a request-scoped Supabase
// client (anon key + user cookies) so RLS constrains every query to the caller.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Course,
  CourseSession,
  CourseMetadata,
  CourseRequirement,
  CourseWithSessionsAndMetadata,
} from "@/lib/courses/types";

/** The caller's favorited course ids, newest first. */
export async function getFavoriteCourseIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("course_favorites")
    .select("course_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => r.course_id as string);
}

/**
 * Load the caller's favorited courses as full CourseWithSessionsAndMetadata[]
 * (sessions + metadata + requirements), so the favorites page renders cards
 * identical to search. Order matches getFavoriteCourseIds (newest first).
 * Classification confidence/source are redacted (server-side only), same as
 * the search endpoint.
 */
export async function getFavoriteCourses(
  supabase: SupabaseClient,
  userId: string
): Promise<CourseWithSessionsAndMetadata[]> {
  const ids = await getFavoriteCourseIds(supabase, userId);
  if (ids.length === 0) return [];

  const [courseR, sessR, metaR, reqR] = await Promise.all([
    supabase.from("courses").select("*").in("id", ids),
    supabase.from("course_sessions").select("*").in("course_id", ids),
    supabase.from("course_metadata").select("*").in("course_id", ids),
    supabase.from("course_requirements").select("*").in("course_id", ids),
  ]);
  if (courseR.error) throw courseR.error;
  if (sessR.error) throw sessR.error;
  if (metaR.error || reqR.error) {
    console.warn(
      "[favorites] classification tables unavailable:",
      metaR.error?.message ?? reqR.error?.message
    );
  }

  const sessionsBy = new Map<string, CourseSession[]>();
  for (const s of (sessR.data ?? []) as CourseSession[]) {
    const list = sessionsBy.get(s.course_id) ?? [];
    list.push(s);
    sessionsBy.set(s.course_id, list);
  }
  const metaBy = new Map<string, CourseMetadata>();
  for (const m of (metaR.data ?? []) as CourseMetadata[]) {
    const { source: _src, confidence: _conf, ...pub } = m;
    void _src;
    void _conf;
    metaBy.set(m.course_id, pub as CourseMetadata);
  }
  const reqBy = new Map<string, CourseRequirement[]>();
  for (const r of (reqR.data ?? []) as CourseRequirement[]) {
    const list = reqBy.get(r.course_id) ?? [];
    list.push(r);
    reqBy.set(r.course_id, list);
  }

  const byId = new Map((courseR.data ?? []).map((c) => [(c as Course).id, c as Course]));
  const out: CourseWithSessionsAndMetadata[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) continue; // a 停開/deleted course no longer in `courses`
    out.push({
      ...c,
      sessions: sessionsBy.get(id) ?? [],
      metadata: metaBy.get(id) ?? null,
      requirements: reqBy.get(id) ?? [],
    });
  }
  return out;
}

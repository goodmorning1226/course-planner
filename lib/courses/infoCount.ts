// Keep courses.info_count fresh after a 修課情報 write (review / grade report),
// so browse-by-情報 ordering updates without re-running the batch script.
//
// info_count = 評論數 + 相異成績分布學期數 (grade_distributions ∪ grade_reports),
// keyed by course identity (match_key). We write it onto every course row that
// shares that identity. Best-effort: never throws (never breaks the write).

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchKey } from "@/lib/reviews/key";

export async function refreshInfoCount(
  svc: SupabaseClient,
  courseName: string,
  teacher: string | null
): Promise<void> {
  try {
    const key = matchKey(courseName, teacher);
    const [rv, gd, gr, courses] = await Promise.all([
      svc.from("course_reviews").select("id", { count: "exact", head: true }).eq("match_key", key),
      svc.from("grade_distributions").select("semester").eq("match_key", key),
      svc.from("grade_reports").select("semester").eq("match_key", key),
      svc.from("courses").select("id, course_name, teacher").eq("course_name", courseName),
    ]);
    const sems = new Set<string>();
    for (const r of gd.data ?? []) sems.add((r as { semester: string }).semester);
    for (const r of gr.data ?? []) sems.add((r as { semester: string }).semester);
    const info = (rv.count ?? 0) + sems.size;
    // Only rows whose identity actually resolves to this key (guards against
    // same-name different-teacher rows sharing a course_name).
    const ids = (courses.data ?? [])
      .filter((c) => matchKey(c.course_name as string, (c.teacher as string) ?? null) === key)
      .map((c) => c.id as string);
    if (ids.length) await svc.from("courses").update({ info_count: info }).in("id", ids);
  } catch (err) {
    console.warn("[refreshInfoCount] failed:", (err as Error).message);
  }
}

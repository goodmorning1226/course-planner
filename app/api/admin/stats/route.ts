import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

// GET /api/admin/stats — dashboard metrics. Admin only.
export async function GET() {
  if (!(await getAdminUser())) return apiError("forbidden", "沒有權限。");

  try {
    const db = createServiceRoleClient();
    const head = { count: "exact" as const, head: true };

    const [courses, tcRows, classified, ge, timetables, pv, lastRun, users] =
      await Promise.all([
        db.from("courses").select("*", head),
        // All timetable memberships → distinct timetable_id = number of users
        // who have at least one course in their timetable.
        db.from("timetable_courses").select("timetable_id"),
        db.from("course_metadata").select("*", head),
        db.from("course_metadata").select("*", head).eq("is_general_education", true),
        db.from("timetable_courses").select("*", head),
        db.from("site_stats").select("count").eq("key", "page_views").maybeSingle(),
        db.from("scrape_runs").select("status, finished_at, course_count").order("started_at", { ascending: false }).limit(1).maybeSingle(),
        db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ]);

    const usersWithCourses = new Set(
      (tcRows.data ?? []).map((r) => (r as { timetable_id: string }).timetable_id)
    ).size;

    return NextResponse.json({
      courses: courses.count ?? 0,
      classified: classified.count ?? 0,
      generalEducation: ge.count ?? 0,
      timetableEntries: timetables.count ?? 0,
      pageViews: Number(pv.data?.count ?? 0),
      users: users.data?.users?.length ?? 0,
      usersWithCourses,
      lastScrape: lastRun.data ?? null,
    });
  } catch (err) {
    console.error("[/api/admin/stats] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤。");
  }
}

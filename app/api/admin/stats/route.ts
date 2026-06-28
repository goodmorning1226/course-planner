import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

// GET /api/admin/stats — dashboard metrics + time-series. Admin only.

type Point = { label: string; value: number };
/** UTC instant → Taiwan (UTC+8) ISO string; .slice gives TW date/hour parts. */
const tw = (iso: string | number) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString();
/** Prepend a 0-value point one day before the first, so a single-day series
 *  still draws a line (rising from a 0 baseline). */
function withStart(series: Point[]): Point[] {
  if (series.length === 0) return series;
  const prev = new Date(new Date(series[0].label + "T00:00:00Z").getTime() - 86400_000)
    .toISOString()
    .slice(0, 10);
  return [{ label: prev, value: 0 }, ...series];
}

export async function GET() {
  if (!(await getAdminUser())) return apiError("forbidden", "沒有權限。");

  try {
    const db = createServiceRoleClient();
    const head = { count: "exact" as const, head: true };
    const nowTw = tw(Date.now());
    const today = nowTw.slice(0, 10);

    const [courses, removed, tcRows, classified, ge, timetables, pv, lastRun, users, anon, pvDays, pvHours] =
      await Promise.all([
        db.from("courses").select("*", head).eq("status", "active"),
        db.from("courses").select("*", head).eq("status", "removed"),
        db.from("timetable_courses").select("timetable_id"),
        db.from("course_metadata").select("*", head),
        db.from("course_metadata").select("*", head).eq("is_general_education", true),
        db.from("timetable_courses").select("*", head),
        db.from("site_stats").select("count").eq("key", "page_views").maybeSingle(),
        db.from("scrape_runs").select("status, finished_at, course_count").order("started_at", { ascending: false }).limit(1).maybeSingle(),
        db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        // anonymous (non-registered) visitors who currently have a timetable
        db.from("timetable_activity").select("*", head).gt("course_count", 0),
        db.from("site_stats").select("key, count").like("key", "pv:%"),
        db.from("site_stats").select("key, count").like("key", `pvh:${today}T%`),
      ]);

    // 已排課人數 = registered (distinct timetable) + anonymous (localStorage)
    const registeredWithCourses = new Set(
      (tcRows.data ?? []).map((r) => (r as { timetable_id: string }).timetable_id)
    ).size;
    const usersWithCourses = registeredWithCourses + (anon.count ?? 0);

    // --- time-series -------------------------------------------------------
    const userList = users.data?.users ?? [];
    // 使用者: cumulative total by day (all-time) and by hour (today)
    const byDay = new Map<string, number>();
    let beforeToday = 0;
    const hourNew = new Map<number, number>();
    for (const u of userList) {
      if (!u.created_at) continue;
      const t = tw(u.created_at);
      const d = t.slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
      if (d < today) beforeToday++;
      else if (d === today) { const h = Number(t.slice(11, 13)); hourNew.set(h, (hourNew.get(h) ?? 0) + 1); }
    }
    const usersAllTime: Point[] = [];
    let cum = 0;
    for (const d of [...byDay.keys()].sort()) { cum += byDay.get(d)!; usersAllTime.push({ label: d, value: cum }); }
    const curHour = Number(nowTw.slice(11, 13));
    const usersToday: Point[] = [];
    let c2 = beforeToday;
    for (let h = 0; h <= curHour; h++) { c2 += hourNew.get(h) ?? 0; usersToday.push({ label: `${String(h).padStart(2, "0")}:00`, value: c2 }); }

    // 瀏覽數: cumulative TOTAL over time. We only have per-day buckets since
    // stats collection started; all earlier views are one lump in the
    // page_views counter. Show that history as a single estimated diagonal
    // (launch → first real day), then the real cumulative line on top — so the
    // last point equals the true total (the 瀏覽數 metric card).
    const totalPv = Number(pv.data?.count ?? 0);
    const pvBuckets = ((pvDays.data ?? []) as { key: string; count: number }[])
      .map((r) => ({ day: r.key.slice(3), count: Number(r.count) }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const sumBuckets = pvBuckets.reduce((s, b) => s + b.count, 0);
    const historical = Math.max(0, totalPv - sumBuckets); // accrued before stats
    const launchDay = usersAllTime[0]?.label ?? pvBuckets[0]?.day ?? today;
    const pvAllTime: Point[] = [{ label: launchDay, value: 0 }]; // estimate start
    if (pvBuckets.length === 0) {
      pvAllTime.push({ label: today, value: totalPv }); // no real data yet
    } else {
      let pvCum = historical;
      for (const b of pvBuckets) { pvCum += b.count; pvAllTime.push({ label: b.day, value: pvCum }); }
    }
    // key = "pvh:YYYY-MM-DDTHH" → hour is chars 15..16 (after the "T" at 14).
    const pvHourMap = new Map<number, number>();
    for (const r of (pvHours.data ?? []) as { key: string; count: number }[]) pvHourMap.set(Number(r.key.slice(15, 17)), Number(r.count));
    const pvToday: Point[] = [];
    for (let h = 0; h <= curHour; h++) pvToday.push({ label: `${String(h).padStart(2, "0")}:00`, value: pvHourMap.get(h) ?? 0 });

    return NextResponse.json({
      courses: courses.count ?? 0,
      coursesRemoved: removed.count ?? 0,
      classified: classified.count ?? 0,
      generalEducation: ge.count ?? 0,
      timetableEntries: timetables.count ?? 0,
      pageViews: Number(pv.data?.count ?? 0),
      users: userList.length,
      usersWithCourses,
      lastScrape: lastRun.data ?? null,
      series: {
        usersAllTime: withStart(usersAllTime),
        usersToday,
        pvAllTime,
        pvToday,
      },
    });
  } catch (err) {
    console.error("[/api/admin/stats] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤。");
  }
}

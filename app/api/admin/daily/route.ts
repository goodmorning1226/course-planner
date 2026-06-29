import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

// GET /api/admin/daily?date=YYYY-MM-DD — that day's per-hour breakdown of
// 使用者 / 瀏覽數 / 活躍人數. Admin only. The hourly history is persisted in
// site_stats (pvh:/active:h:) + auth.users, so any past day is reproducible.

type Point = { label: string; value: number };
const tw = (iso: string | number) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString();

export async function GET(req: Request) {
  if (!(await getAdminUser())) return apiError("forbidden", "沒有權限。");

  const { searchParams } = new URL(req.url);
  const date = (searchParams.get("date") ?? "").trim();
  const today = tw(Date.now()).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) {
    return apiError("invalid_request", "日期不合法。");
  }

  try {
    const db = createServiceRoleClient();
    const [users, pvHours, activeHours] = await Promise.all([
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      db.from("site_stats").select("key, count").like("key", `pvh:${date}T%`),
      db.from("site_stats").select("key, count").like("key", `active:h:${date}T%`),
    ]);

    // 使用者: new signups that hour (from auth created_at, TW-bucketed).
    const userHour = new Map<number, number>();
    for (const u of users.data?.users ?? []) {
      if (!u.created_at) continue;
      const t = tw(u.created_at);
      if (t.slice(0, 10) === date) {
        const h = Number(t.slice(11, 13));
        userHour.set(h, (userHour.get(h) ?? 0) + 1);
      }
    }
    const pvHour = new Map<number, number>();
    for (const r of (pvHours.data ?? []) as { key: string; count: number }[]) pvHour.set(Number(r.key.slice(15, 17)), Number(r.count));
    const activeHour = new Map<number, number>();
    for (const r of (activeHours.data ?? []) as { key: string; count: number }[]) activeHour.set(Number(r.key.slice(-2)), Number(r.count));

    // Past days: full 24h. Today: up to the current hour.
    const maxHour = date === today ? Number(tw(Date.now()).slice(11, 13)) : 23;
    const build = (m: Map<number, number>): Point[] => {
      const out: Point[] = [];
      for (let h = 0; h <= maxHour; h++) out.push({ label: `${String(h).padStart(2, "0")}:00`, value: m.get(h) ?? 0 });
      return out;
    };
    const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

    return NextResponse.json({
      date,
      usersHourly: build(userHour),
      pvHourly: build(pvHour),
      activeHourly: build(activeHour),
      totals: { users: sum(userHour), pv: sum(pvHour), active: sum(activeHour) },
    });
  } catch (err) {
    console.error("[/api/admin/daily] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤。");
  }
}

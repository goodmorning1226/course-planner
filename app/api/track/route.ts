import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";

// POST /api/track — increment the page-view counters. Public + rate limited.
// Best-effort; never errors out the page. Records:
//   page_views           — all-time total
//   pv:<YYYY-MM-DD>      — daily bucket (all-time line chart)
//   pvh:<YYYY-MM-DDTHH>  — hourly bucket (today's line chart)
// Buckets use Taiwan time (UTC+8) so "today" matches users' local day.
export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "track"), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ ok: false });
  try {
    const db = createServiceRoleClient();
    const tw = new Date(Date.now() + 8 * 3600_000).toISOString(); // UTC parts = TW time
    await Promise.all([
      db.rpc("increment_stat", { k: "page_views" }),
      db.rpc("increment_stat", { k: `pv:${tw.slice(0, 10)}` }),
      db.rpc("increment_stat", { k: `pvh:${tw.slice(0, 13)}` }),
    ]);
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ ok: true });
}

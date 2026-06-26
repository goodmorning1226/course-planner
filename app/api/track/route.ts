import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";

// POST /api/track — increment the page-view counter. Public + rate limited.
// Best-effort; never errors out the page.
export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "track"), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ ok: false });
  try {
    const db = createServiceRoleClient();
    await db.rpc("increment_stat", { k: "page_views" });
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ ok: true });
}

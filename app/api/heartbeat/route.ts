import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";

// POST /api/heartbeat — presence ping from an open tab. Records the client as
// active now + as active in the current hour/day bucket. PII-free (random id).
export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "heartbeat"), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ ok: false });
  try {
    const body = await req.json().catch(() => null);
    const clientId = typeof body?.clientId === "string" ? body.clientId.slice(0, 64) : "";
    if (!/^[A-Za-z0-9-]{8,64}$/.test(clientId)) return NextResponse.json({ ok: false });

    const db = createServiceRoleClient();
    const now = new Date();
    await db
      .from("active_sessions")
      .upsert({ client_id: clientId, last_seen: now.toISOString() }, { onConflict: "client_id" });

    // Taiwan (UTC+8) hour/day buckets. First time a client lands in a bucket,
    // bump the distinct-active counter in site_stats.
    const tw = new Date(now.getTime() + 8 * 3600_000).toISOString();
    for (const bucket of [`d:${tw.slice(0, 10)}`, `h:${tw.slice(0, 13)}`]) {
      const { data } = await db
        .from("presence")
        .upsert({ bucket, client_id: clientId }, { onConflict: "bucket,client_id", ignoreDuplicates: true })
        .select("bucket");
      if (data && data.length) await db.rpc("increment_stat", { k: `active:${bucket}` });
    }
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ ok: true });
}

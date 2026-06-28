import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { rateLimit, clientKey } from "@/lib/rate-limit";

// POST /api/track-timetable — record that an ANONYMOUS (not-logged-in) visitor
// has N courses in their (localStorage) timetable, so 已排課人數 can include
// people who never registered. PII-free: just a random client id + a count.
// Logged-in users are counted via timetable_courses, so they don't call this.
export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "track-tt"), 30, 60_000);
  if (!rl.ok) return NextResponse.json({ ok: false });
  try {
    const body = await req.json().catch(() => null);
    const clientId = typeof body?.clientId === "string" ? body.clientId.slice(0, 64) : "";
    const courseCount = Math.max(0, Math.min(999, Number(body?.courseCount) || 0));
    if (!/^[A-Za-z0-9-]{8,64}$/.test(clientId)) return NextResponse.json({ ok: false });

    const db = createServiceRoleClient();
    await db
      .from("timetable_activity")
      .upsert(
        { client_id: clientId, course_count: courseCount, updated_at: new Date().toISOString() },
        { onConflict: "client_id" }
      );
  } catch {
    /* best-effort */
  }
  return NextResponse.json({ ok: true });
}

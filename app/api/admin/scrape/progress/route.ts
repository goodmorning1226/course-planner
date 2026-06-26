import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

// GET /api/admin/scrape/progress?runId=… — per-building progress for the UI.
// Also returns the latest run id so the UI can resume after a reload.
export async function GET(req: Request) {
  if (!(await getAdminUser())) return apiError("forbidden", "沒有權限。");

  const { searchParams } = new URL(req.url);
  let runId = searchParams.get("runId");

  const db = createServiceRoleClient();
  if (!runId) {
    const { data } = await db
      .from("scrape_runs")
      .select("id, status")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    runId = (data?.id as string) ?? null;
  }
  if (!runId) return NextResponse.json({ runId: null, buildings: [], run: null });

  const [{ data: buildings }, { data: run }] = await Promise.all([
    db
      .from("scrape_progress")
      .select("building, scraped_count, total_count, done_rooms, status")
      .eq("run_id", runId)
      .order("building", { ascending: true }),
    db.from("scrape_runs").select("status, course_count, finished_at").eq("id", runId).maybeSingle(),
  ]);

  return NextResponse.json({ runId, buildings: buildings ?? [], run: run ?? null });
}

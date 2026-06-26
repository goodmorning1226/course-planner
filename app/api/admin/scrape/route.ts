import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getAdminUser } from "@/lib/admin-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

// POST /api/admin/scrape — one-click: re-scrape ALL courses, then classify only
// NEW courses. Admin only. Returns a runId the UI polls for per-building progress.
//
// The scrape is a long (30+ min) Playwright job, so it's spawned as a detached
// child process. THIS REQUIRES A LONG-RUNNING NODE HOST (local / self-hosted) —
// it does not work on serverless (Vercel) functions; there, run the scripts on a
// worker/cron instead. See README.
export async function POST() {
  if (!(await getAdminUser())) return apiError("forbidden", "沒有權限。");

  const db = createServiceRoleClient();

  // Don't start a second scrape while one is running.
  const { data: running } = await db
    .from("scrape_runs")
    .select("id")
    .eq("status", "running")
    .limit(1)
    .maybeSingle();
  if (running) {
    return apiError("invalid_request", "已有一個爬蟲正在執行。");
  }

  const runId = randomUUID();
  try {
    const child = spawn(
      "npx tsx scripts/scrape-ntu-classrooms.ts && npx tsx scripts/enrich-course-metadata.ts",
      {
        cwd: process.cwd(),
        shell: true,
        detached: true,
        stdio: "ignore",
        env: { ...process.env, SCRAPE_RUN_ID: runId, ENRICH_ONLY_NEW: "1" },
      }
    );
    child.unref();
    return NextResponse.json({ runId });
  } catch (err) {
    console.error("[/api/admin/scrape] spawn failed:", err);
    return apiError("internal_error", "無法啟動爬蟲。");
  }
}

import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { getAdminUser } from "@/lib/admin-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import { scrapeSectionBodySchema } from "@/lib/validations";

// POST /api/admin/scrape — (re-)scrape a section, then classify its NEW courses.
// Body: { section: 'all' | 'ntust' | '%'(其他) | <BuildingDDL value> }. Admin only.
//
// Each scrape is a long Playwright job, spawned as a detached child process —
// THIS REQUIRES A LONG-RUNNING NODE HOST (local / self-hosted), not serverless.
// Concurrency is intentionally serialized (one scrape at a time) to stay polite
// to the WAF-protected source; clicking another section while one runs is denied.
export async function POST(req: Request) {
  if (!(await getAdminUser())) return apiError("forbidden", "沒有權限。");

  // Serverless (Vercel) can't run the Playwright crawl: no Chromium, the detached
  // child dies when the function returns, and there's an execution-time limit.
  // Fail loudly with instructions instead of silently spawning nothing.
  if (process.env.VERCEL) {
    return apiError(
      "invalid_request",
      "線上環境（serverless）無法直接執行爬蟲。請在本機連到正式 Supabase 執行：" +
        "全爬 `npm run scrape && npm run enrich`；單區 `SCRAPE_ONLY=<value> SCRAPE_SECTION=<label> npm run scrape`、" +
        "再 `ENRICH_BUILDING=<label> ENRICH_ONLY_NEW=1 npm run enrich`；台科 `npm run interschool:fetch && npm run interschool:apply -- --apply`。"
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body → defaults to 'all' */
  }
  const parsed = scrapeSectionBodySchema.safeParse(body ?? {});
  if (!parsed.success) return apiError("invalid_request", "section 不合法。");
  const { section } = parsed.data;

  const db = createServiceRoleClient();

  // One scrape at a time — but a run that's been "running" for >60 min is almost
  // certainly a crashed/killed process; mark it errored so it can't block forever.
  const { data: running } = await db
    .from("scrape_runs")
    .select("id, section, started_at")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (running) {
    const ageMs = Date.now() - new Date(running.started_at as string).getTime();
    if (ageMs < 60 * 60_000) {
      return apiError("invalid_request", `已有一個爬蟲正在執行（${running.section ?? "?"}）。`);
    }
    await db
      .from("scrape_runs")
      .update({ status: "error", finished_at: new Date().toISOString(), error_message: "stale: exceeded 60m" })
      .eq("id", running.id);
  }

  // Resolve a building value → its label (for SCRAPE_SECTION / ENRICH_BUILDING).
  let label = section;
  if (section !== "all" && section !== "ntust") {
    if (section === "%") {
      label = "其他";
    } else {
      const { data: b } = await db
        .from("scrape_buildings")
        .select("label")
        .eq("value", section)
        .maybeSingle();
      if (!b) return apiError("invalid_request", "找不到這個建物/學院。");
      label = b.label as string;
    }
  }

  const runId = randomUUID();
  const tsx = "npx tsx";
  let cmd: string;
  const env: NodeJS.ProcessEnv = { ...process.env, SCRAPE_RUN_ID: runId };

  if (section === "ntust") {
    // 台科 校際: live-API fetch → apply. Pre-create the run + progress so the
    // "running" guard + UI bar are live during the (script-less) fetch step;
    // apply upserts the same run id and finishes it.
    await db.from("scrape_runs").insert({ id: runId, semester: "115-1", status: "running", section: "ntust" });
    await db.from("scrape_progress").upsert(
      { run_id: runId, building: "台科大", total_count: 2, done_rooms: 0, scraped_count: 0, status: "running" },
      { onConflict: "run_id,building" }
    );
    cmd = `${tsx} scripts/fetch-interschool-ntust.mjs && node scripts/apply-interschool.mjs --apply`;
  } else if (section === "all") {
    cmd = `${tsx} scripts/scrape-ntu-classrooms.ts && ${tsx} scripts/enrich-course-metadata.ts`;
    env.SCRAPE_SECTION = "all";
    env.ENRICH_ONLY_NEW = "1";
  } else {
    // single section: scrape only this building/其他, then classify only its new.
    cmd = `${tsx} scripts/scrape-ntu-classrooms.ts && ${tsx} scripts/enrich-course-metadata.ts`;
    env.SCRAPE_ONLY = section; // DDL value or "%"
    env.SCRAPE_SECTION = label;
    env.ENRICH_ONLY_NEW = "1";
    env.ENRICH_BUILDING = label;
  }

  try {
    const child = spawn(cmd, {
      cwd: process.cwd(),
      shell: true,
      detached: true,
      stdio: "ignore",
      env,
    });
    child.unref();
    return NextResponse.json({ runId, section, label });
  } catch (err) {
    console.error("[/api/admin/scrape] spawn failed:", err);
    return apiError("internal_error", "無法啟動爬蟲。");
  }
}

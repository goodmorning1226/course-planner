import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

// GET /api/admin/scrape/progress — per-section scrape state for /admin/scrape.
// Returns one entry per section (each building/college + 其他 + 台科大), each with
// its latest run's progress bar + change count, plus the global running state.

interface SectionState {
  key: string; // trigger value: BuildingDDL value | '%' | 'ntust'
  label: string;
  kind: "building" | "other" | "ntust";
  total_count: number;
  done_rooms: number;
  scraped_count: number;
  status: string | null; // pending|running|done|error|null(never run)
  lastRunAt: string | null;
  changeCount: number;
}

export async function GET() {
  if (!(await getAdminUser())) return apiError("forbidden", "沒有權限。");

  const db = createServiceRoleClient();

  const [{ data: buildings }, { data: runs }, { data: running }] = await Promise.all([
    db.from("scrape_buildings").select("value, label"),
    db
      .from("scrape_runs")
      .select("id, section, status, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(60),
    db
      .from("scrape_runs")
      .select("id, section, started_at")
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  // A run "running" for >60 min is treated as dead (a crashed process) — don't
  // let it disable the UI; the next trigger will mark it errored.
  const liveRunning =
    running && Date.now() - new Date(running.started_at as string).getTime() < 60 * 60_000
      ? running
      : null;

  const runIds = (runs ?? []).map((r) => r.id as string);
  const startedById = new Map((runs ?? []).map((r) => [r.id as string, r.started_at as string]));

  const [{ data: progress }, { data: changes }] = await Promise.all([
    runIds.length
      ? db
          .from("scrape_progress")
          .select("run_id, building, total_count, done_rooms, scraped_count, status")
          .in("run_id", runIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    runIds.length
      ? db
          .from("course_changes")
          .select("run_id, building_or_college")
          .in("run_id", runIds)
          .limit(20000)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  // Latest progress row per building label (most-recent run that touched it).
  const latestByLabel = new Map<string, Record<string, unknown>>();
  const sorted = [...(progress ?? [])].sort(
    (a, b) =>
      (startedById.get(b.run_id as string) ?? "").localeCompare(startedById.get(a.run_id as string) ?? "")
  );
  for (const row of sorted) {
    const label = row.building as string;
    if (!latestByLabel.has(label)) latestByLabel.set(label, row);
  }

  // Change counts per (run_id, building label).
  const changeCount = new Map<string, number>();
  for (const c of changes ?? []) {
    const k = `${c.run_id}|${c.building_or_college}`;
    changeCount.set(k, (changeCount.get(k) ?? 0) + 1);
  }

  // Build the section list: named buildings + 其他 (from scrape_buildings) + 台科.
  const blds = (buildings ?? []) as { value: string; label: string }[];
  const named = blds.filter((b) => b.value !== "%").sort((a, b) => a.label.localeCompare(b.label, "zh"));
  const other = blds.find((b) => b.value === "%");

  function sectionFrom(key: string, label: string, kind: SectionState["kind"]): SectionState {
    const p = latestByLabel.get(label);
    const runId = (p?.run_id as string) ?? null;
    return {
      key,
      label,
      kind,
      total_count: (p?.total_count as number) ?? 0,
      done_rooms: (p?.done_rooms as number) ?? 0,
      scraped_count: (p?.scraped_count as number) ?? 0,
      status: (p?.status as string) ?? null,
      lastRunAt: runId ? startedById.get(runId) ?? null : null,
      changeCount: runId ? changeCount.get(`${runId}|${label}`) ?? 0 : 0,
    };
  }

  const sections: SectionState[] = [
    ...named.map((b) => sectionFrom(b.value, b.label, "building")),
    sectionFrom(other?.value ?? "%", other?.label ?? "其他", "other"),
    sectionFrom("ntust", "台科大", "ntust"),
  ];

  const lastFull = (runs ?? []).find((r) => r.section === "all") ?? null;

  return NextResponse.json({
    running: liveRunning ? { runId: liveRunning.id, section: liveRunning.section } : null,
    sections,
    full: lastFull
      ? { lastRunAt: lastFull.started_at, status: lastFull.status, finishedAt: lastFull.finished_at }
      : null,
  });
}

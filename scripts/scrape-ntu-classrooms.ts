/**
 * Low-frequency scraper for the NTU classroom-usage query system.
 *
 *   NTU classroom schedule  →  parse + period conversion  →  upsert into our DB
 *   (users only ever read OUR database, never NTU directly)
 *
 * Run with: `npm run scrape`  (uses tsx; loads .env.local / .env automatically)
 * Requires Playwright + Chromium in the run environment:
 *   npm i -D playwright && npx playwright install chromium
 *
 * -------------------------------------------------------------------------
 * SOURCE STRUCTURE (verified 2026-06 against a populated room):
 *   Query:  GET .../classrm/acarm/webcr-use-new
 *           ?SYearDDL=1151&BuildingDDL=<建物>&RoomDDL=<教室>&SelectButton=查詢
 *           SelectButton=查詢 IS required to actually run the search. The source
 *           sits behind a WAF that rejects some non-browser requests, so we
 *           drive it with a headless browser (Playwright) rather than fetch.
 *   Rooms:  GET .../classrm/acarm/get-classroom-by-building?building=<建物>
 *           → JSON { room_ls: [{ cr_no }] }
 *   Data:   the course objects live in the JS global `timeDT`, indexed by weekday
 *           then period column: timeDT[wk]["Info" + col] = [ courseObj, ... ].
 *             cr_cono 流水號 → pk   cr_clas 班次   cr_cnam 課名   cr_tenam 教師
 *             cr_no 教室     cr_time 時間 "第1..8週 (一) 10:20~12:10"
 * -------------------------------------------------------------------------
 *
 * MODES (env):
 *   SCRAPE_ONLY=<DDL value|"%">   scrape ONLY one section (a building, or "%"=其他).
 *   SCRAPE_SECTION=<label>        run's section label (for the change log / UI).
 *   SCRAPE_ORPHAN_ONLY=1          crawl only the 其他/% orphan rooms.
 *   SCRAPE_RUN_ID / SCRAPE_DRY_RUN / SCRAPE_MAX_ROOMS / NTU_BUILDINGS as before.
 *
 * On each run we: detect added/changed courses (write a field-level change log),
 * prune stale sessions (so a moved time/room doesn't leave a ghost in users'
 * timetables), and SOFT-DELETE (status='removed', 停開) courses that vanished from
 * the crawled section(s) — never a hard delete. Reappearing courses are restored.
 *
 * POLITENESS / SAFETY: LOW FREQUENCY, sequential, delayed, normal UA. Reads only
 * the public schedule; writes use the SERVICE ROLE key (server-only).
 */

import { chromium, type Browser, type BrowserContext } from "playwright";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  convertTimeRangeToPeriods,
  parseTimeRange,
} from "../lib/courses/periods";
import type { PeriodCode, Weekday } from "../lib/courses/types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
loadEnv();

const QUERY_SEMESTER = (process.env.NTU_SEMESTER ?? "1151").replace(/\D/g, "");
const DB_SEMESTER = "115-1";

const ORIGIN = "https://gra206.aca.ntu.edu.tw";
const QUERY_URL = `${ORIGIN}/classrm/acarm/webcr-use-new`;
const ROOM_API = `${ORIGIN}/classrm/acarm/get-classroom-by-building`;

const USER_AGENT =
  process.env.SCRAPE_USER_AGENT ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const REQUEST_DELAY_MS = Number(process.env.SCRAPE_DELAY_MS ?? 1500);
const MAX_ROOMS = Number(process.env.SCRAPE_MAX_ROOMS ?? 0); // 0 = no cap
const DRY_RUN =
  process.env.SCRAPE_DRY_RUN === "1" || process.env.SCRAPE_DRY_RUN === "true";

// Single-section mode: a BuildingDDL value, or "%" for the 其他 orphan bucket.
const ONLY = process.env.SCRAPE_ONLY ? process.env.SCRAPE_ONLY.trim() : null;
// "%" target ≡ orphan-only crawl (named buildings only seed seenRooms).
const ORPHAN_ONLY =
  process.env.SCRAPE_ORPHAN_ONLY === "1" ||
  process.env.SCRAPE_ORPHAN_ONLY === "true" ||
  ONLY === "%";
const RUN_SECTION = process.env.SCRAPE_SECTION ?? (ONLY ? ONLY : "all");
const OTHER_LABEL = "其他";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw course object as read from `timeDT`, tagged with its weekday row. */
interface RawCourse {
  wk: number; // timeDT index: 0=日 … 6=六
  cr_cono?: string;
  cr_clas?: string;
  cr_cnam?: string;
  cr_tenam?: string;
  cr_no?: string;
  cr_time?: string;
}

interface ParsedSession {
  weekday: Weekday | null;
  classroom: string | null;
  raw_time_text: string | null;
  periods: PeriodCode[];
  start_time: string | null;
  end_time: string | null;
}

interface ParsedCourse {
  pk: string;
  building_or_college: string;
  course_name: string;
  class_group: string | null;
  teacher: string | null;
  sessions: Map<string, ParsedSession>;
}

/** DB snapshot of an existing course, for change detection + soft-delete. */
interface ExistingCourse {
  id: string;
  sig: string;
  building: string | null;
  name: string;
  class_group: string | null;
  teacher: string | null;
  sessionKeys: Set<string>; // `${weekday}|${raw_time}|${classroom}|${periods}`
  status: string; // 'active' | 'removed'
}

/** A row queued for the course_changes log. */
interface ChangeRow {
  run_id: string | null;
  course_id: string | null;
  course_pk: string | null;
  course_name: string | null;
  building_or_college: string | null;
  change_type: string;
  detail: Record<string, unknown> | null;
  changed_on: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (!m) continue;
        let val = m[2];
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        )
          val = val.slice(1, -1);
        if (process.env[m[1]] === undefined) process.env[m[1]] = val;
      }
    } catch {
      /* file absent — fine */
    }
  }
}

function nullIfEmpty(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** timeDT row index → ISO weekday (1=Mon … 7=Sun). 0 = Sunday. */
function weekdayFromRow(wk: number): Weekday | null {
  if (wk === 0) return 7;
  if (wk >= 1 && wk <= 6) return wk as Weekday;
  return null;
}

/** Pull "HH:MM-HH:MM" out of a cr_time like "第1..8週 (一) 10:20~12:10". */
function extractTimeRange(crTime: string | null): string | null {
  if (!crTime) return null;
  const m = crTime.match(/(\d{1,2}:\d{2})\s*[~\-－–—]\s*(\d{1,2}:\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Taiwan (UTC+8) date bucket "YYYY-MM-DD" for the change log. */
function twDate(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** Session sig used for change detection (matches loadExisting / parsedSignature). */
function sessionKeyOf(s: ParsedSession): string {
  return `${s.weekday ?? ""}|${s.raw_time_text ?? ""}|${s.classroom ?? ""}|${s.periods.join(",")}`;
}
function parseKey(k: string): { weekday: string; time: string; classroom: string } {
  const [weekday, time, classroom] = k.split("|");
  return { weekday: weekday ?? "", time: time ?? "", classroom: classroom ?? "" };
}
function fmtKey(k: string): string {
  const p = parseKey(k);
  return `週${p.weekday || "?"} ${p.time || "?"}${p.classroom ? ` @${p.classroom}` : ""}`;
}

// ---------------------------------------------------------------------------
// Scraping (Playwright)
// ---------------------------------------------------------------------------

interface BuildingOpt {
  value: string;
  label: string;
}
async function fetchBuildings(ctx: BrowserContext): Promise<BuildingOpt[]> {
  if (process.env.NTU_BUILDINGS) {
    return process.env.NTU_BUILDINGS.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((v) => ({ value: v, label: v }));
  }
  const page = await ctx.newPage();
  try {
    await page.goto(QUERY_URL, { waitUntil: "load", timeout: 40000 });
    const opts = await page.$$eval("select#BuildingDDL option", (os) =>
      os.map((o) => ({
        value: (o as HTMLOptionElement).value,
        label: (o.textContent ?? "").trim() || (o as HTMLOptionElement).value,
      }))
    );
    return opts.filter((o) => o.value && o.value !== "%");
  } finally {
    await page.close();
  }
}

/** Room list for a building via the JSON API (browser context bypasses WAF). */
async function fetchRooms(ctx: BrowserContext, building: string): Promise<string[]> {
  const res = await ctx.request.get(
    `${ROOM_API}?building=${encodeURIComponent(building)}`,
    { timeout: 30000 }
  );
  if (!res.ok()) throw new Error(`room api HTTP ${res.status()}`);
  const json = (await res.json()) as { room_ls?: { cr_no?: string }[] };
  return (json.room_ls ?? [])
    .map((r) => r.cr_no)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

/** Load one room's timetable and read the course objects out of `timeDT`. */
async function fetchRoomCourses(
  ctx: BrowserContext,
  building: string,
  room: string
): Promise<RawCourse[]> {
  const url =
    `${QUERY_URL}?SYearDDL=${encodeURIComponent(QUERY_SEMESTER)}` +
    `&BuildingDDL=${encodeURIComponent(building)}` +
    `&RoomDDL=${encodeURIComponent(room)}` +
    `&SelectButton=${encodeURIComponent("查詢")}`;

  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "load", timeout: 40000 });
    const title = await page.title();
    if (title.includes("Rejected")) throw new Error("WAF rejected");
    return await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t: any = (window as any).timeDT;
      if (!Array.isArray(t)) return [];
      const out: Record<string, unknown>[] = [];
      t.forEach((day: Record<string, unknown>, wk: number) => {
        for (const k of Object.keys(day)) {
          if (k.startsWith("Info") && Array.isArray(day[k])) {
            for (const o of day[k] as Record<string, unknown>[]) {
              out.push({ wk, ...o });
            }
          }
        }
      });
      return out;
    }) as unknown as RawCourse[];
  } finally {
    await page.close();
  }
}

/** Merge raw course objects from one room into the accumulator. */
function accumulate(
  raw: RawCourse[],
  building: string,
  queriedRoom: string,
  acc: Map<string, ParsedCourse>
) {
  for (const c of raw) {
    const courseName = nullIfEmpty(c.cr_cnam);
    const cono = nullIfEmpty(c.cr_cono);
    if (!courseName || !cono) continue; // course_name + 流水號 required

    const classGroup = nullIfEmpty(c.cr_clas);
    const pk = classGroup ? `${cono}-${classGroup}` : cono;

    let course = acc.get(pk);
    if (!course) {
      course = {
        pk,
        building_or_college: building,
        course_name: courseName,
        class_group: classGroup,
        teacher: nullIfEmpty(c.cr_tenam),
        sessions: new Map(),
      };
      acc.set(pk, course);
    }

    const weekday = weekdayFromRow(c.wk);
    const classroom = nullIfEmpty(c.cr_no) ?? nullIfEmpty(queriedRoom);
    const rawTime = nullIfEmpty(c.cr_time);
    const range = extractTimeRange(rawTime);
    const periods = convertTimeRangeToPeriods(range);
    const parsedRange = parseTimeRange(range);

    const key = `${weekday ?? ""}|${rawTime ?? ""}|${classroom ?? ""}`;
    if (!course.sessions.has(key)) {
      course.sessions.set(key, {
        weekday,
        classroom,
        raw_time_text: rawTime,
        periods,
        start_time: parsedRange?.start ?? null,
        end_time: parsedRange?.end ?? null,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function makeServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Upsert a course + its sessions, mark it active (restoring a 停開 course), and
 * PRUNE stale sessions: any existing session of this course whose classroom is
 * one of the rooms crawled in THIS section but was not re-seen is deleted — so a
 * moved time/room doesn't leave a ghost. Scoping the prune to this section's
 * rooms means a course that also meets in another building keeps those sessions.
 */
async function persistCourse(
  supabase: SupabaseClient,
  course: ParsedCourse,
  roomsSet: Set<string>
) {
  const { data: upserted, error: courseErr } = await supabase
    .from("courses")
    .upsert(
      {
        semester: DB_SEMESTER,
        pk: course.pk,
        building_or_college: course.building_or_college,
        course_name: course.course_name,
        class_group: course.class_group,
        teacher: course.teacher,
        source_url: QUERY_URL,
        scraped_at: new Date().toISOString(),
        status: "active",
        removed_at: null,
      },
      { onConflict: "semester,pk" }
    )
    .select("id")
    .single();
  if (courseErr || !upserted) {
    throw new Error(`upsert course failed (${course.course_name}): ${courseErr?.message}`);
  }

  const courseId = upserted.id as string;
  const sessions = [...course.sessions.values()];

  if (sessions.length > 0) {
    const { error: upErr } = await supabase.from("course_sessions").upsert(
      sessions.map((s) => ({
        course_id: courseId,
        weekday: s.weekday,
        classroom: s.classroom,
        raw_time_text: s.raw_time_text,
        periods: s.periods,
        start_time: s.start_time,
        end_time: s.end_time,
      })),
      { onConflict: "course_id,weekday,raw_time_text,classroom", ignoreDuplicates: true }
    );
    if (upErr) throw new Error(`upsert sessions failed: ${upErr.message}`);
  }

  // Prune stale sessions in this section's rooms (delete-by-id; never touches
  // sessions whose classroom belongs to another building).
  if (roomsSet.size > 0) {
    const seen = new Set(
      sessions.map((s) => `${s.weekday ?? ""}|${s.raw_time_text ?? ""}|${s.classroom ?? ""}`)
    );
    const { data: existSess } = await supabase
      .from("course_sessions")
      .select("id, weekday, raw_time_text, classroom")
      .eq("course_id", courseId);
    const stale = (existSess ?? [])
      .filter((s) => {
        const cr = (s.classroom ?? "") as string;
        if (!cr || !roomsSet.has(cr)) return false;
        return !seen.has(`${s.weekday ?? ""}|${s.raw_time_text ?? ""}|${cr}`);
      })
      .map((s) => s.id as string);
    if (stale.length) await supabase.from("course_sessions").delete().in("id", stale);
  }

  return courseId;
}

/** Persist the BuildingDDL value↔label map so the admin UI can drive sections. */
async function persistBuildingMap(supabase: SupabaseClient, buildings: BuildingOpt[]) {
  const rows = buildings.map((b) => ({ value: b.value, label: b.label, updated_at: new Date().toISOString() }));
  rows.push({ value: "%", label: OTHER_LABEL, updated_at: new Date().toISOString() });
  await supabase.from("scrape_buildings").upsert(rows, { onConflict: "value" });
}

// ---------------------------------------------------------------------------
// Progress + change-detection
// ---------------------------------------------------------------------------

async function setProgress(
  supabase: SupabaseClient,
  runId: string,
  building: string,
  fields: Partial<{ scraped_count: number; total_count: number; done_rooms: number; status: string }>
) {
  await supabase
    .from("scrape_progress")
    .upsert({ run_id: runId, building, ...fields }, { onConflict: "run_id,building" });
}

function parsedSignature(c: ParsedCourse): string {
  return (
    [c.building_or_college, c.course_name, c.class_group ?? "", c.teacher ?? ""].join("|") +
    "::" +
    [...c.sessions.values()].map(sessionKeyOf).sort().join(";")
  );
}

/**
 * Field-level diff between an existing course and its freshly-scraped form.
 * Session changes are scoped to THIS section's rooms so a multi-building course
 * isn't reported as "losing" its other building's sessions. Building relabels
 * are intentionally omitted (last-writer noise on multi-building courses).
 */
function computeDiff(
  prev: ExistingCourse,
  course: ParsedCourse,
  roomsSet: Set<string>
): Record<string, unknown> {
  const detail: Record<string, unknown> = {};
  if (prev.name !== course.course_name) detail.name = { from: prev.name, to: course.course_name };
  if ((prev.teacher ?? "") !== (course.teacher ?? ""))
    detail.teacher = { from: prev.teacher, to: course.teacher };
  if ((prev.class_group ?? "") !== (course.class_group ?? ""))
    detail.class_group = { from: prev.class_group, to: course.class_group };

  const newKeys = [...course.sessions.values()].map(sessionKeyOf);
  const newSet = new Set(newKeys);
  // Scope previous sessions to this section's rooms (or, when not crawling rooms,
  // to all — e.g. a header-only run). null-classroom keys are out of scope.
  const prevScoped = [...prev.sessionKeys].filter((k) =>
    roomsSet.size === 0 ? true : roomsSet.has(parseKey(k).classroom)
  );
  const added = newKeys.filter((k) => !prev.sessionKeys.has(k));
  const removed = prevScoped.filter((k) => !newSet.has(k));
  if (added.length || removed.length) {
    if (added.length === 1 && removed.length === 1) {
      const a = parseKey(added[0]);
      const r = parseKey(removed[0]);
      if (a.classroom === r.classroom && a.time !== r.time) detail.time = { from: r.time, to: a.time };
      else if (a.time === r.time && a.classroom !== r.classroom)
        detail.classroom = { from: r.classroom, to: a.classroom };
      else detail.sessions = { added: added.map(fmtKey), removed: removed.map(fmtKey) };
    } else {
      detail.sessions = { added: added.map(fmtKey), removed: removed.map(fmtKey) };
    }
  }
  return detail;
}

/** Existing courses keyed by pk: header + session keys + status, for diffing. */
async function loadExisting(supabase: SupabaseClient): Promise<Map<string, ExistingCourse>> {
  const PAGE = 1000;
  const byId = new Map<string, ExistingCourse>();
  const pkById = new Map<string, string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("courses")
      .select("id, pk, building_or_college, course_name, class_group, teacher, status")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      if (!r.pk) continue;
      byId.set(r.id as string, {
        id: r.id as string,
        sig: "",
        building: (r.building_or_college as string) ?? null,
        name: r.course_name as string,
        class_group: (r.class_group as string) ?? null,
        teacher: (r.teacher as string) ?? null,
        sessionKeys: new Set(),
        status: (r.status as string) ?? "active",
      });
      pkById.set(r.id as string, r.pk as string);
    }
    if (rows.length < PAGE) break;
  }
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("course_sessions")
      .select("course_id, weekday, raw_time_text, classroom, periods")
      .order("course_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const s of rows) {
      const e = byId.get(s.course_id as string);
      if (e)
        e.sessionKeys.add(
          `${s.weekday ?? ""}|${s.raw_time_text ?? ""}|${s.classroom ?? ""}|${(s.periods ?? []).join(",")}`
        );
    }
    if (rows.length < PAGE) break;
  }
  const out = new Map<string, ExistingCourse>();
  for (const [id, e] of byId) {
    e.sig =
      [e.building ?? "", e.name, e.class_group ?? "", e.teacher ?? ""].join("|") +
      "::" +
      [...e.sessionKeys].sort().join(";");
    out.set(pkById.get(id)!, e);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    `[scrape] semester=${QUERY_SEMESTER} (db=${DB_SEMESTER}) section=${RUN_SECTION} only=${ONLY ?? "-"} dryRun=${DRY_RUN}`
  );

  const writable = DRY_RUN ? null : makeServiceClient();
  if (!DRY_RUN && !writable) {
    console.warn("[scrape] Supabase env missing — switching to DRY RUN.");
  }

  const presetRunId = process.env.SCRAPE_RUN_ID || null;
  let runId: string | null = presetRunId;
  if (writable) {
    const { data } = await writable
      .from("scrape_runs")
      .insert({
        ...(presetRunId ? { id: presetRunId } : {}),
        semester: DB_SEMESTER,
        status: "running",
        section: RUN_SECTION,
      })
      .select("id")
      .single();
    runId = (data?.id as string) ?? presetRunId;
  }

  const existing = writable ? await loadExisting(writable) : new Map<string, ExistingCourse>();
  console.log(`[scrape] loaded ${existing.size} existing courses.`);

  const changeOn = twDate();
  const changeBuf: ChangeRow[] = [];
  function logChange(
    type: string,
    course: { pk: string | null; name: string | null; building: string | null; id?: string | null },
    detail: Record<string, unknown> | null
  ) {
    changeBuf.push({
      run_id: runId,
      course_id: course.id ?? null,
      course_pk: course.pk,
      course_name: course.name,
      building_or_college: course.building,
      change_type: type,
      detail,
      changed_on: changeOn,
    });
  }
  async function flushChanges() {
    if (!writable || changeBuf.length === 0) return;
    const rows = changeBuf.splice(0, changeBuf.length);
    const { error } = await writable.from("course_changes").insert(rows);
    if (error) console.warn(`[scrape] change-log insert failed: ${error.message}`);
  }

  let browser: Browser | null = null;
  const skipped: string[] = [];
  const drySamples: ParsedCourse[] = [];
  let requests = 0;
  let totalCourses = 0;
  let written = 0;
  let unchanged = 0;

  const seenPks = new Set<string>();
  const crawledLabels: string[] = [];
  const sectionHealth = new Map<string, { rooms: number; errored: boolean }>();

  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: USER_AGENT });

    const buildings = await fetchBuildings(ctx);
    requests++;
    if (writable) await persistBuildingMap(writable, buildings);
    buildings.push({ value: "%", label: OTHER_LABEL });
    const seenRooms = new Set<string>();
    console.log(`[scrape] buildings: ${buildings.length} → ${buildings.map((b) => b.label).join(",")}`);
    await sleep(REQUEST_DELAY_MS);

    for (const { value, label } of buildings) {
      // Single named-building target: skip everything else outright (no need to
      // seed seenRooms — that only matters for the % orphan pass).
      if (ONLY && ONLY !== "%" && value !== ONLY) continue;

      let rooms: string[] = [];
      try {
        rooms = await fetchRooms(ctx, value);
        requests++;
        if (value === "%") rooms = rooms.filter((r) => !seenRooms.has(r));
        else for (const r of rooms) seenRooms.add(r);
      } catch (err) {
        skipped.push(`building ${label}: ${(err as Error).message}`);
        console.warn(`[scrape] skip building ${label}: ${(err as Error).message}`);
        sectionHealth.set(label, { rooms: 0, errored: true });
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      // Orphan-only: named buildings just seed seenRooms; only crawl "%".
      if (ORPHAN_ONLY && value !== "%") {
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      if (MAX_ROOMS > 0 && rooms.length > MAX_ROOMS) rooms = rooms.slice(0, MAX_ROOMS);
      const roomsSet = new Set(rooms);
      crawledLabels.push(label);
      sectionHealth.set(label, { rooms: rooms.length, errored: false });
      console.log(`[scrape] building ${label}: ${rooms.length} rooms`);
      if (writable && runId)
        await setProgress(writable, runId, label, {
          total_count: rooms.length, done_rooms: 0, scraped_count: 0, status: "running",
        });
      await sleep(REQUEST_DELAY_MS);

      const buildingCourses = new Map<string, ParsedCourse>();
      let roomIdx = 0;
      let roomErrors = 0;
      for (const room of rooms) {
        try {
          const raw = await fetchRoomCourses(ctx, value, room);
          requests++;
          accumulate(raw, label, room, buildingCourses);
        } catch (err) {
          roomErrors++;
          skipped.push(`room ${label}/${room}: ${(err as Error).message}`);
          console.warn(`[scrape] skip ${label}/${room}: ${(err as Error).message}`);
        }
        roomIdx++;
        if (writable && runId)
          await setProgress(writable, runId, label, {
            done_rooms: roomIdx, scraped_count: buildingCourses.size,
          });
        await sleep(REQUEST_DELAY_MS);
      }
      // A section that lost a large share of its rooms to errors is untrustworthy
      // for soft-delete (could be a source glitch) — flag it.
      if (rooms.length > 0 && roomErrors > rooms.length * 0.5)
        sectionHealth.set(label, { rooms: rooms.length, errored: true });

      const list = [...buildingCourses.values()];
      totalCourses += list.length;

      if (!writable) {
        drySamples.push(...list.slice(0, 2));
        for (const c of list) seenPks.add(c.pk);
        continue;
      }

      let bWritten = 0;
      for (const course of list) {
        seenPks.add(course.pk);
        try {
          const prev = existing.get(course.pk);
          const sig = parsedSignature(course);
          if (prev && prev.sig === sig) {
            if (prev.status === "removed") {
              await writable.from("courses").update({ status: "active", removed_at: null }).eq("id", prev.id);
              prev.status = "active";
              logChange("restored", { pk: course.pk, name: course.course_name, building: course.building_or_college, id: prev.id }, null);
            } else {
              unchanged++;
            }
            continue;
          }
          const courseId = await persistCourse(writable, course, roomsSet);
          bWritten++;
          written++;
          if (!prev) {
            logChange("added", { pk: course.pk, name: course.course_name, building: course.building_or_college, id: courseId }, null);
          } else {
            if (prev.status === "removed")
              logChange("restored", { pk: course.pk, name: course.course_name, building: course.building_or_college, id: courseId }, null);
            const diff = computeDiff(prev, course, roomsSet);
            if (Object.keys(diff).length > 0)
              logChange("updated", { pk: course.pk, name: course.course_name, building: course.building_or_college, id: courseId }, diff);
          }
          // Refresh the in-memory snapshot so a later building doesn't re-diff.
          existing.set(course.pk, {
            id: courseId,
            sig,
            building: course.building_or_college,
            name: course.course_name,
            class_group: course.class_group,
            teacher: course.teacher,
            sessionKeys: new Set([...course.sessions.values()].map(sessionKeyOf)),
            status: "active",
          });
        } catch (err) {
          skipped.push(`persist ${course.course_name}: ${(err as Error).message}`);
          console.warn(`[scrape] persist failed: ${(err as Error).message}`);
        }
      }
      if (runId)
        await setProgress(writable, runId, label, {
          scraped_count: list.length, done_rooms: rooms.length, status: "done",
        });
      await flushChanges(); // commit this section's change log immediately
      console.log(`[scrape] ${label}: ${bWritten} changed/new, ${list.length - bWritten} unchanged.`);
    }

    // --- soft-delete pass (after all crawled sections) -----------------------
    if (writable) await reconcileRemovals(writable, crawledLabels, seenPks, sectionHealth, existing, logChange);
    await flushChanges();

    console.log(
      `[scrape] parsed ${totalCourses} courses from ${requests} requests ` +
        `(${written} changed/new, ${unchanged} unchanged, ${skipped.length} skipped).`
    );

    if (!writable) {
      console.log("[scrape] DRY RUN — not writing to DB. Sample:");
      for (const c of drySamples.slice(0, 8)) {
        const s = [...c.sessions.values()][0];
        console.log(
          `   · [${c.pk}] ${c.course_name} ${c.teacher ?? ""} ` +
            `@${s?.classroom ?? "?"} wd${s?.weekday ?? "?"} 節次${s?.periods.join(",") || "?"}`
        );
      }
      return;
    }

    if (runId) {
      await writable
        .from("scrape_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "success",
          course_count: written,
          error_message: skipped.length ? `partial: ${skipped.length} skipped` : null,
        })
        .eq("id", runId);
    }
    console.log(`[scrape] done. wrote ${written} courses.`);
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    console.error("[scrape] fatal:", message);
    if (writable && runId) {
      await writable
        .from("scrape_runs")
        .update({ finished_at: new Date().toISOString(), status: "error", error_message: message.slice(0, 1000) })
        .eq("id", runId);
    }
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Soft-delete courses that vanished from the crawled section(s). Scoped per
 * section label; never touches NTUST rows (their building label is never a
 * crawled NTU section). Guards: skip a section that errored, had 0 rooms, or
 * where >50% of its courses went missing (a likely source glitch) — and log it.
 */
async function reconcileRemovals(
  supabase: SupabaseClient,
  crawledLabels: string[],
  seenPks: Set<string>,
  sectionHealth: Map<string, { rooms: number; errored: boolean }>,
  existing: Map<string, ExistingCourse>,
  logChange: (
    type: string,
    course: { pk: string | null; name: string | null; building: string | null; id?: string | null },
    detail: Record<string, unknown> | null
  ) => void
) {
  const now = new Date().toISOString();
  for (const label of crawledLabels) {
    const health = sectionHealth.get(label);
    const candidates: { pk: string; e: ExistingCourse }[] = [];
    let totalActive = 0;
    for (const [pk, e] of existing) {
      if ((e.building ?? "") !== label || e.status !== "active") continue;
      totalActive++;
      if (!seenPks.has(pk)) candidates.push({ pk, e });
    }
    if (!health || health.errored || health.rooms === 0) {
      logChange("removal_skipped", { pk: null, name: null, building: label }, { reason: health?.errored ? "errored" : "no_rooms" });
      continue;
    }
    if (totalActive > 0 && candidates.length > totalActive * 0.5) {
      logChange("removal_skipped", { pk: null, name: null, building: label }, { reason: "too_many", missing: candidates.length, total: totalActive });
      console.warn(`[scrape] ${label}: removal skipped — ${candidates.length}/${totalActive} missing (>50%).`);
      continue;
    }
    if (candidates.length === 0) continue;
    const ids = candidates.map((c) => c.e.id);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await supabase.from("courses").update({ status: "removed", removed_at: now }).in("id", chunk);
      if (error) { console.warn(`[scrape] soft-delete failed: ${error.message}`); continue; }
    }
    for (const c of candidates) {
      c.e.status = "removed";
      logChange("removed", { pk: c.pk, name: c.e.name, building: label, id: c.e.id }, null);
    }
    console.log(`[scrape] ${label}: soft-deleted ${candidates.length} course(s).`);
  }
}

main().catch((err) => {
  console.error("[scrape] failed:", err);
  process.exit(1);
});

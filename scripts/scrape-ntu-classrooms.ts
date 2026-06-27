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
 *   Data:   the course objects are NOT in the page's hidden inputs (those are
 *           empty). They live in the JS global `timeDT`, indexed by weekday then
 *           period column: timeDT[wk]["Info" + col] = [ courseObj, ... ].
 *           Each courseObj (field names from the site's cou_tooltip):
 *             cr_cono  流水號   → pk          e.g. "201 49810"
 *             cr_clas  班次     → class_group
 *             cr_cnam  課名     → course_name (required)
 *             cr_tenam 教師     → teacher     (may be empty)
 *             cr_no    教室     → classroom
 *             cr_time  時間     → raw_time_text e.g. "第1..8週 (一) 10:20~12:10"
 *   A course spanning several periods appears in several cells with the SAME
 *   cr_cono + cr_time → we dedupe by (cr_cono, weekday, cr_time, classroom) and
 *   group every cr_cono into one course (multiple meeting days = multiple
 *   sessions). weekday comes from the timeDT row; periods from the time range
 *   inside cr_time.
 * -------------------------------------------------------------------------
 *
 * POLITENESS / SAFETY (per spec): LOW FREQUENCY, sequential (never parallel),
 * delay between every request, normal User-Agent. Does NOT log in, does NOT
 * bypass any access control, only reads the publicly queryable schedule. Writes
 * use the SERVICE ROLE key (server-only).
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

// ---------------------------------------------------------------------------
// Scraping (Playwright)
// ---------------------------------------------------------------------------

/**
 * Building dropdown entries to crawl (excludes "" and "%"). We query by `value`
 * (e.g. "1") but store the human-readable `label` (e.g. "文學院") so the UI can
 * filter by it.
 */
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

    // A 流水號 (cr_cono) can be shared by several 班次 (cr_clas) — those are
    // DIFFERENT courses. So the pk = 流水號 + 班次 (流水號 alone if no 班次).
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
    const periods = convertTimeRangeToPeriods(range); // [] if unparseable
    const parsedRange = parseTimeRange(range);

    // Dedupe the same session repeated across the period-columns it spans.
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

async function persistCourse(supabase: SupabaseClient, course: ParsedCourse) {
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
    // Upsert (not delete-then-insert) so persisting per building is safe even
    // for a course that meets in more than one building — its sessions
    // accumulate; the unique (course_id, weekday, raw_time_text, classroom)
    // makes re-runs idempotent.
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
}

// ---------------------------------------------------------------------------
// Progress + change-detection (for the admin one-click scrape)
// ---------------------------------------------------------------------------

/** Live per-building progress row for the admin UI. */
async function setProgress(
  supabase: SupabaseClient,
  runId: string,
  building: string,
  fields: Partial<{
    scraped_count: number;
    total_count: number;
    done_rooms: number;
    status: string;
  }>
) {
  await supabase
    .from("scrape_progress")
    .upsert({ run_id: runId, building, ...fields }, { onConflict: "run_id,building" });
}

/** Signature of a course's header + sessions, to detect "did it change?". */
function courseSignature(c: {
  building_or_college: string;
  course_name: string;
  class_group: string | null;
  teacher: string | null;
  sessionSigs: string[];
}): string {
  return (
    [c.building_or_college, c.course_name, c.class_group ?? "", c.teacher ?? ""].join("|") +
    "::" +
    [...c.sessionSigs].sort().join(";")
  );
}
function parsedSignature(c: ParsedCourse): string {
  return courseSignature({
    building_or_college: c.building_or_college,
    course_name: c.course_name,
    class_group: c.class_group,
    teacher: c.teacher,
    sessionSigs: [...c.sessions.values()].map(
      (s) => `${s.weekday ?? ""}|${s.raw_time_text ?? ""}|${s.classroom ?? ""}|${s.periods.join(",")}`
    ),
  });
}

/** Existing courses' signatures keyed by pk (for change detection). */
async function loadExistingSignatures(
  supabase: SupabaseClient
): Promise<Map<string, string>> {
  const sigs = new Map<string, string>();
  const PAGE = 1000;
  // courses
  const headers = new Map<string, { id: string; sig: string; sessions: string[] }>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("courses")
      .select("id, pk, building_or_college, course_name, class_group, teacher")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      if (!r.pk) continue;
      headers.set(r.id as string, {
        id: r.id as string,
        sig: [r.building_or_college ?? "", r.course_name, r.class_group ?? "", r.teacher ?? ""].join("|"),
        sessions: [],
      });
      sigs.set(r.pk as string, r.id as string); // temp: pk -> id
    }
    if (rows.length < PAGE) break;
  }
  // sessions
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("course_sessions")
      .select("course_id, weekday, raw_time_text, classroom, periods")
      .order("course_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const s of rows) {
      const h = headers.get(s.course_id as string);
      if (h)
        h.sessions.push(
          `${s.weekday ?? ""}|${s.raw_time_text ?? ""}|${s.classroom ?? ""}|${(s.periods ?? []).join(",")}`
        );
    }
    if (rows.length < PAGE) break;
  }
  // final: pk -> full signature
  const out = new Map<string, string>();
  const idToHeader = new Map([...headers.values()].map((h) => [h.id, h]));
  for (const [pk, id] of sigs) {
    const h = idToHeader.get(id as string);
    if (h) out.set(pk, h.sig + "::" + [...h.sessions].sort().join(";"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    `[scrape] semester=${QUERY_SEMESTER} (db=${DB_SEMESTER}) dryRun=${DRY_RUN}`
  );

  const writable = DRY_RUN ? null : makeServiceClient();
  if (!DRY_RUN && !writable) {
    console.warn("[scrape] Supabase env missing — switching to DRY RUN.");
  }

  // The admin one-click trigger passes SCRAPE_RUN_ID so it can poll progress.
  const presetRunId = process.env.SCRAPE_RUN_ID || null;
  let runId: string | null = presetRunId;
  if (writable) {
    const { data } = await writable
      .from("scrape_runs")
      .insert({
        ...(presetRunId ? { id: presetRunId } : {}),
        semester: DB_SEMESTER,
        status: "running",
      })
      .select("id")
      .single();
    runId = (data?.id as string) ?? presetRunId;
  }

  // Existing signatures → only write courses whose data actually changed.
  const existing = writable ? await loadExistingSignatures(writable) : new Map<string, string>();
  console.log(`[scrape] loaded ${existing.size} existing course signatures.`);

  let browser: Browser | null = null;
  const skipped: string[] = [];
  const drySamples: ParsedCourse[] = [];
  let requests = 0;
  let totalCourses = 0;
  let totalSessions = 0;
  let written = 0;
  let unchanged = 0;

  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: USER_AGENT });

    const buildings = await fetchBuildings(ctx);
    requests++;
    // Some courses (體育 at 網球場/球場, 新生專題, 外教 等) sit only under the
    // "全部"(%) bucket — rooms that belong to NO named building — so they were
    // missed. Append a final "其他" pass that crawls exactly those orphan rooms.
    buildings.push({ value: "%", label: "其他" });
    const seenRooms = new Set<string>();
    console.log(
      `[scrape] buildings: ${buildings.length} → ${buildings.map((b) => b.label).join(",")}`
    );
    await sleep(REQUEST_DELAY_MS);

    // Crawl + PERSIST one building at a time, so an interruption only loses the
    // current building's work, not the whole crawl.
    for (const { value, label } of buildings) {
      let rooms: string[] = [];
      try {
        rooms = await fetchRooms(ctx, value); // room API keyed by value
        requests++;
        // "其他"(%) returns ALL rooms; keep only those not in a named building.
        if (value === "%") rooms = rooms.filter((r) => !seenRooms.has(r));
        else for (const r of rooms) seenRooms.add(r);
      } catch (err) {
        skipped.push(`building ${label}: ${(err as Error).message}`);
        console.warn(`[scrape] skip building ${label}: ${(err as Error).message}`);
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      // Fast path: only crawl the orphan ("其他") rooms; named buildings just
      // seed seenRooms (their room lists) so we know what counts as orphan.
      if (process.env.SCRAPE_ORPHAN_ONLY && value !== "%") {
        await sleep(REQUEST_DELAY_MS);
        continue;
      }
      if (MAX_ROOMS > 0 && rooms.length > MAX_ROOMS) rooms = rooms.slice(0, MAX_ROOMS);
      console.log(`[scrape] building ${label}: ${rooms.length} rooms`);
      if (writable && runId)
        await setProgress(writable, runId, label, {
          total_count: rooms.length, done_rooms: 0, scraped_count: 0, status: "running",
        });
      await sleep(REQUEST_DELAY_MS);

      const buildingCourses = new Map<string, ParsedCourse>();
      let roomIdx = 0;
      for (const room of rooms) {
        try {
          const raw = await fetchRoomCourses(ctx, value, room); // query by value
          requests++;
          accumulate(raw, label, room, buildingCourses); // store readable label
        } catch (err) {
          skipped.push(`room ${label}/${room}: ${(err as Error).message}`);
          console.warn(`[scrape] skip ${label}/${room}: ${(err as Error).message}`);
        }
        roomIdx++;
        if (writable && runId)
          await setProgress(writable, runId, label, {
            done_rooms: roomIdx, scraped_count: buildingCourses.size,
          });
        await sleep(REQUEST_DELAY_MS); // gentle, sequential
      }

      const list = [...buildingCourses.values()];
      totalCourses += list.length;
      totalSessions += list.reduce((n, c) => n + c.sessions.size, 0);

      if (!writable) {
        drySamples.push(...list.slice(0, 2));
        continue;
      }

      let bWritten = 0;
      for (const course of list) {
        try {
          // Only write when the course's data actually changed (or is new).
          const sig = parsedSignature(course);
          if (existing.get(course.pk) === sig) {
            unchanged++;
            continue;
          }
          await persistCourse(writable, course);
          existing.set(course.pk, sig);
          written++;
          bWritten++;
        } catch (err) {
          skipped.push(`persist ${course.course_name}: ${(err as Error).message}`);
          console.warn(`[scrape] persist failed: ${(err as Error).message}`);
        }
      }
      if (runId)
        await setProgress(writable, runId, label, {
          scraped_count: list.length, done_rooms: rooms.length, status: "done",
        });
      console.log(
        `[scrape] ${label}: ${bWritten} changed/new, ${list.length - bWritten} unchanged (total written ${written}).`
      );
    }

    console.log(
      `[scrape] parsed ${totalCourses} courses / ${totalSessions} sessions ` +
        `from ${requests} requests (${written} changed, ${unchanged} unchanged, ${skipped.length} skipped).`
    );

    if (!writable) {
      console.log("[scrape] DRY RUN — not writing to DB. Sample:");
      for (const c of drySamples.slice(0, 8)) {
        const s = [...c.sessions.values()][0];
        console.log(
          `   · [${c.pk}] ${c.course_name} ${c.teacher ?? ""} ` +
            `@${s?.classroom ?? "?"} wd${s?.weekday ?? "?"} ` +
            `節次${s?.periods.join(",") || "?"}  (${c.sessions.size} session(s))`
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
        .update({
          finished_at: new Date().toISOString(),
          status: "error",
          error_message: message.slice(0, 1000),
        })
        .eq("id", runId);
    }
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error("[scrape] failed:", err);
  process.exit(1);
});

/**
 * Course metadata enrichment.
 *
 *   existing courses  →  fetch OFFICIAL / HISTORICAL classification  →  upsert
 *                        course_metadata + course_requirements
 *
 * Run with: `npm run enrich`  (tsx; loads .env.local / .env)
 *
 * PRINCIPLES (per spec):
 *  - NEVER guess 通識 / 必選修 from a course name. Classifications must come from
 *    a real source. When none is found, the course is left 尚未分類 (no row).
 *  - Source priority: official_1151 (high) → historical_match (medium) →
 *    course_code_inference (dept/college only, low/medium).
 *  - Idempotent: metadata upserts on course_id; requirements are replaced.
 *  - Does NOT touch courses / course_sessions. Failures never corrupt them.
 *  - Polite: low frequency, sequential, delay between external requests; no
 *    login, no auth bypass, no parallel flooding.
 *
 * STATUS: the external fetch (`fetchClassification`) is the single integration
 * point. It currently returns null for every course (no source wired yet), so a
 * run leaves everything 尚未分類. Wire the NTU 課程網 (official 115-1) or a
 * historical-semester source there, then re-run to populate high/medium data.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeCourseType,
  normalizeRequirement,
  parseGeneralEducationCategories,
  parseGeneralEducationLabels,
  isGeneralEducationCourse,
} from "../lib/courses/classification";
import type { Confidence, RequirementNormalized } from "../lib/courses/types";

loadEnv();
const REQUEST_DELAY_MS = Number(process.env.ENRICH_DELAY_MS ?? 1500);
const DRY_RUN =
  process.env.ENRICH_DRY_RUN === "1" || process.env.ENRICH_DRY_RUN === "true";

interface CourseRow {
  id: string;
  semester: string;
  pk: string | null;
  course_name: string;
  teacher: string | null;
  class_group: string | null;
}

/** Raw classification fetched from an official/historical source. */
interface RawClassification {
  source: string; // official_1151 | historical_match | course_code_inference
  confidence: Confidence;
  matched_semester: string | null;
  // metadata
  official_course_code?: string | null;
  official_course_identifier?: string | null;
  credits?: number | null;
  course_type_raw?: string | null;
  ge_creditable?: boolean | null;
  // requirements (audience-relative)
  requirements?: {
    target_department_name?: string | null;
    target_department_code?: string | null;
    target_college_name?: string | null;
    audience_raw?: string | null;
    requirement_raw?: string | null;
  }[];
}

// ---------------------------------------------------------------------------
// Integration point — wire a real NTU 課程網 / historical source here.
// ---------------------------------------------------------------------------
/**
 * Look up the official (115-1) or historical classification for one course.
 *
 * Priority:
 *  1. official_1151  — query the NTU course catalog by (semester, pk). high.
 *  2. historical_match — match courseName + teacher + class_group in 114-1 /
 *                        113-1 / 112-1 catalogs. medium.
 *  3. course_code_inference — dept/college ONLY from the course code prefix.
 *                        low/medium. NEVER for 通識 / 必選修.
 *
 * Returns null when no source yields a confident classification → course stays
 * 尚未分類. NOT YET WIRED: returns null for everything.
 */
async function fetchClassification(
  _course: CourseRow
): Promise<RawClassification | null> {
  // TODO: implement against the NTU course catalog (official 115-1) and/or
  // historical-semester data. Until then, no classification is produced — we do
  // NOT guess from the course name.
  return null;
}

// ---------------------------------------------------------------------------

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (m && process.env[m[1]] === undefined)
          process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
      }
    } catch {
      /* file absent */
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Read all courses, paging past PostgREST's 1000-row cap. */
async function readAllCourses(supabase: SupabaseClient): Promise<CourseRow[]> {
  const all: CourseRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("courses")
      .select("id, semester, pk, course_name, teacher, class_group")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as CourseRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/** Upsert metadata + replace requirements for one course. */
async function persist(
  supabase: SupabaseClient,
  course: CourseRow,
  raw: RawClassification
) {
  const typeRaw = raw.course_type_raw ?? null;
  const ge = parseGeneralEducationCategories(typeRaw);
  const { error: metaErr } = await supabase.from("course_metadata").upsert(
    {
      course_id: course.id,
      official_semester: raw.matched_semester,
      official_course_code: raw.official_course_code ?? null,
      official_course_identifier: raw.official_course_identifier ?? null,
      credits: raw.credits ?? null,
      course_type_raw: typeRaw,
      course_type_normalized: normalizeCourseType(typeRaw),
      is_general_education: isGeneralEducationCourse(typeRaw),
      ge_categories: ge,
      ge_labels: parseGeneralEducationLabels(typeRaw),
      ge_creditable: raw.ge_creditable ?? null,
      source: raw.source,
      confidence: raw.confidence,
      matched_semester: raw.matched_semester,
      matched_at: new Date().toISOString(),
    },
    { onConflict: "course_id" }
  );
  if (metaErr) throw new Error(`metadata upsert: ${metaErr.message}`);

  // Replace requirements (audience-relative) for this course.
  await supabase.from("course_requirements").delete().eq("course_id", course.id);
  const reqs = (raw.requirements ?? []).map((r) => ({
    course_id: course.id,
    target_department_name: r.target_department_name ?? null,
    target_department_code: r.target_department_code ?? null,
    target_college_name: r.target_college_name ?? null,
    audience_raw: r.audience_raw ?? null,
    requirement_raw: r.requirement_raw ?? null,
    requirement_normalized: normalizeRequirement(
      r.requirement_raw
    ) as RequirementNormalized,
    source: raw.source,
    confidence: raw.confidence,
    matched_semester: raw.matched_semester,
  }));
  if (reqs.length > 0) {
    const { error: reqErr } = await supabase
      .from("course_requirements")
      .insert(reqs);
    if (reqErr) throw new Error(`requirements insert: ${reqErr.message}`);
  }
}

async function main() {
  const supabase = makeServiceClient();
  if (!supabase) {
    console.error("[enrich] Supabase env missing (need service role). Aborting.");
    process.exit(1);
  }

  const courses = await readAllCourses(supabase);
  console.log(`[enrich] ${courses.length} courses to consider. dryRun=${DRY_RUN}`);

  let classified = 0;
  let unclassified = 0;
  const skipped: string[] = [];

  for (const course of courses) {
    let raw: RawClassification | null = null;
    try {
      raw = await fetchClassification(course);
    } catch (err) {
      skipped.push(`${course.course_name}: ${(err as Error).message}`);
      continue;
    }

    if (!raw) {
      unclassified++;
      continue; // leave 尚未分類 (no metadata row)
    }

    if (DRY_RUN) {
      classified++;
      continue;
    }

    try {
      await persist(supabase, course, raw);
      classified++;
    } catch (err) {
      skipped.push(`${course.course_name}: ${(err as Error).message}`);
    }
    await sleep(REQUEST_DELAY_MS); // gentle when a real source is wired
  }

  console.log(
    `[enrich] done. classified=${classified} unclassified(尚未分類)=${unclassified} ` +
      `skipped=${skipped.length}`
  );
  if (classified === 0) {
    console.log(
      "[enrich] NOTE: no classification source is wired yet — everything is " +
        "尚未分類. Implement fetchClassification() against the NTU 課程網, then re-run."
    );
  }
}

main().catch((err) => {
  console.error("[enrich] failed:", err);
  process.exit(1);
});

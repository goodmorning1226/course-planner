/**
 * Course metadata enrichment — classifies our courses from the NTU course網
 * (course.ntu.edu.tw JSON API) into multiple categories.
 *
 *   course網 catalog (all categories)  →  match by code+class (= our pk)  →
 *   upsert course_metadata (categories[], 通識領域, 學分) + course_requirements
 *
 * Run: `npm run enrich`
 *   NTU_SEMESTER   default 114-1 (course網 has no 115-1 yet → historical/medium;
 *                  when 115-1 appears, set this and it becomes official/high)
 *   ENRICH_ONLY_NEW=1   only classify courses without metadata
 *   NTU_CATEGORIES      comma list of slugs to limit (testing)
 *
 * Every course gets at least one category (unmatched → 系所 by inference), so
 * there is no 未分類. 通識領域 / 必選修 come ONLY from the official catalog.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fetchNtuCatalog, fetchDeptGrades, type NtuInfo } from "./ntu-course-api";
import { GE_AREA_LABELS } from "../lib/courses/classification";
import { DEPT_BY_ID } from "../lib/courses/departments";
import type {
  Confidence,
  CourseTypeNormalized,
  RequirementNormalized,
} from "../lib/courses/types";

loadEnv();
const SEMESTER = process.env.NTU_SEMESTER && /^\d{3}-\d$/.test(process.env.NTU_SEMESTER)
  ? process.env.NTU_SEMESTER
  : "114-1";
const DELAY_MS = Number(process.env.ENRICH_DELAY_MS ?? 400);
const SLUGS = process.env.NTU_CATEGORIES
  ? process.env.NTU_CATEGORIES.split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;
const ONLY_NEW =
  process.env.ENRICH_ONLY_NEW === "1" || process.env.ENRICH_ONLY_NEW === "true";
const SKIP_GRADES =
  process.env.ENRICH_SKIP_GRADES === "1" || process.env.ENRICH_SKIP_GRADES === "true";

const IS_OFFICIAL = SEMESTER === "115-1";
const SOURCE = IS_OFFICIAL ? "official_1151" : "historical_match";
const CONFIDENCE: Confidence = IS_OFFICIAL ? "high" : "medium";

interface CourseRow {
  id: string;
  pk: string | null;
  course_name: string | null;
}

// Name-based category overrides — known facts the course網 catalog mis-files.
// These ADD a category (never remove). 大學英文 is filed under dept but is a
// 共同 (common) requirement. Add more {test, add} rules here as needed.
const CATEGORY_NAME_RULES: { test: (name: string) => boolean; add: string }[] = [
  { test: (n) => n.startsWith("大學英文"), add: "common" },
];

function applyNameRules(name: string | null, categories: string[]): string[] {
  if (!name) return categories;
  const set = new Set(categories);
  for (const rule of CATEGORY_NAME_RULES) {
    if (rule.test(name)) set.add(rule.add);
  }
  return [...set];
}

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (m && process.env[m[1]] === undefined)
          process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
      }
    } catch { /* absent */ }
  }
}

function makeServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function readAllCourses(supabase: SupabaseClient): Promise<CourseRow[]> {
  const all: CourseRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("courses")
      .select("id, pk, course_name")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as CourseRow[];
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}

function deriveType(categories: string[], geSize: number): CourseTypeNormalized {
  if (geSize > 0 || categories.includes("general")) return "general_education";
  if (categories.includes("common")) return "common_required";
  if (categories.includes("pearmy")) return "military";
  if (categories.includes("english")) return "common_required";
  if (categories.includes("program")) return "university_wide";
  if (categories.includes("interschool")) return "intercollegiate";
  return "departmental";
}

function normReq(compulsory: boolean | null): RequirementNormalized {
  if (compulsory === true) return "required";
  if (compulsory === false) return "elective";
  return "unknown";
}

async function persist(
  supabase: SupabaseClient,
  courseId: string,
  courseName: string | null,
  info: NtuInfo | null,
  deptGrades: string[]
) {
  const categories = applyNameRules(courseName, info ? [...info.categories] : ["dept"]);
  const ge = info ? [...info.ge].sort() : [];
  const deptCodes = info ? [...info.depts] : [];
  const src = info ? SOURCE : "course_code_inference";
  const conf: Confidence = info ? CONFIDENCE : "low";

  const { error: metaErr } = await supabase.from("course_metadata").upsert(
    {
      course_id: courseId,
      official_semester: SEMESTER,
      official_course_code: null,
      official_course_identifier: null,
      credits: info?.credits ?? null,
      course_type_raw: null,
      course_type_normalized: deriveType(categories, ge.length),
      categories,
      dept_codes: deptCodes,
      dept_grades: deptGrades,
      is_general_education: ge.length > 0,
      ge_categories: ge,
      ge_labels: ge.map((c) => GE_AREA_LABELS[c]).filter(Boolean),
      ge_creditable: ge.length > 0 ? true : null,
      source: src,
      confidence: conf,
      matched_semester: info ? SEMESTER : null,
      matched_at: new Date().toISOString(),
    },
    { onConflict: "course_id" }
  );
  if (metaErr) throw new Error(`metadata: ${metaErr.message}`);

  await supabase.from("course_requirements").delete().eq("course_id", courseId);
  const seen = new Set<string>();
  const reqs = (info?.requirements ?? [])
    .map((r) => ({
      course_id: courseId,
      target_department_name: r.dept,
      target_department_code: null,
      target_college_name: null,
      audience_raw: r.dept,
      requirement_raw: r.compulsory == null ? null : r.compulsory ? "必修" : "選修",
      requirement_normalized: normReq(r.compulsory),
      source: SOURCE,
      confidence: CONFIDENCE,
      matched_semester: SEMESTER,
    }))
    .filter((r) => {
      const k = `${r.target_department_name}|${r.requirement_normalized}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  if (reqs.length > 0) {
    const { error } = await supabase.from("course_requirements").insert(reqs);
    if (error) throw new Error(`requirements: ${error.message}`);
  }
}

async function main() {
  const supabase = makeServiceClient();
  if (!supabase) {
    console.error("[enrich] Supabase env missing (need service role). Aborting.");
    process.exit(1);
  }

  console.log(`[enrich] reading course網 catalog semester=${SEMESTER} (source=${SOURCE}/${CONFIDENCE})`);
  const catalog = await fetchNtuCatalog(SEMESTER, {
    delayMs: DELAY_MS,
    slugs: SLUGS,
    onCategory: (slug, n) => console.log(`[enrich] category ${slug}: ${n} courses`),
  });
  console.log(`[enrich] catalog: ${catalog.size} distinct course keys.`);

  let courses = await readAllCourses(supabase);
  if (ONLY_NEW) {
    const have = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("course_metadata").select("course_id").range(from, from + 999);
      const rows = data ?? [];
      for (const r of rows) have.add(r.course_id as string);
      if (rows.length < 1000) break;
    }
    const before = courses.length;
    courses = courses.filter((c) => !have.has(c.id));
    console.log(`[enrich] ONLY_NEW: ${courses.length} new of ${before}.`);
  }

  // Grade buckets: course網 segments 年級 server-side (suggestedGrade). Crawl
  // it only for the departments OUR courses actually belong to (and that have
  // grades) → small, faithful per-(dept,grade) pass. pk → Set<"deptId:gradeId">.
  let gradesByPk = new Map<string, Set<string>>();
  if (!SKIP_GRADES) {
    const wanted = new Set<string>();
    for (const course of courses) {
      const info = course.pk ? catalog.get(course.pk) : undefined;
      for (const d of info?.depts ?? []) wanted.add(d);
    }
    const deptList = [...wanted]
      .map((id) => ({ id, gradeIds: (DEPT_BY_ID[id]?.grades ?? []).map((g) => g.id) }))
      .filter((d) => d.gradeIds.length > 0);
    console.log(`[enrich] grade crawl: ${deptList.length} depts (of ${wanted.size} our courses touch)`);
    gradesByPk = await fetchDeptGrades(SEMESTER, deptList, {
      delayMs: DELAY_MS,
      onDept: (id, n) => console.log(`[enrich]   dept ${id}: ${n}`),
    });
    console.log(`[enrich] grade crawl: ${gradesByPk.size} courses tagged.`);
  }

  let matched = 0;
  let inferred = 0;
  const skipped: string[] = [];
  for (const course of courses) {
    const info = course.pk ? catalog.get(course.pk) ?? null : null;
    const deptGrades = course.pk ? [...(gradesByPk.get(course.pk) ?? [])] : [];
    try {
      await persist(supabase, course.id, course.course_name, info, deptGrades);
      if (info) matched++;
      else inferred++;
    } catch (err) {
      skipped.push((err as Error).message);
    }
  }
  console.log(
    `[enrich] done. matched=${matched} inferred(系所)=${inferred} skipped=${skipped.length}`
  );
  if (skipped.length) console.log("[enrich] first skips:", skipped.slice(0, 3));
}

main().catch((err) => {
  console.error("[enrich] failed:", err);
  process.exit(1);
});

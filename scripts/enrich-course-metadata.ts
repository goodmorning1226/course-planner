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

// Name-based classification overrides — known facts the course網 catalog
// mis-files or renames across semesters.
//   add  — add these category slugs (keeps catalog-derived ones).
//   set  — this course's TRUE classification, REPLACING catalog data. Used for
//          cross-semester renames where our pk no longer matches 114-1. Treated
//          as a known historical match (general/medium), not low-confidence.
interface NameOverride {
  match: (name: string) => boolean;
  add?: string[];
  set?: { categories: string[]; ge?: string[]; credits?: number };
}
const NAME_OVERRIDES: NameOverride[] = [
  // 大學英文 is filed under 系所 but is a 共同(common) requirement.
  { match: (n) => n.startsWith("大學英文"), add: ["common"] },
  // 邁向太空 = 114-1「認識星空」(通識 A7 物質科學, 2 學分) 改名而來，非系所課程。
  { match: (n) => n === "邁向太空", set: { categories: ["general"], ge: ["A7"], credits: 2 } },
  // AI 時代的職場協作 = 114-1「數位時代的職場寫作」改名；選修・兼通識 A5・領導學程。
  { match: (n) => n === "AI 時代的職場協作", set: { categories: ["general", "program"], ge: ["A5"] } },
];

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

// ---- cross-semester name + time matching ------------------------------------
// Many courses are renamed slightly between semesters, so an exact pk match
// against 114-1 fails. We recover them by (1) name similarity and (2) the user's
// hint that a renamed course often keeps the SAME time slot — a strong auxiliary
// signal. Sentinel GE area for general courses whose 領域 we can't determine.
const GE_UNDETERMINED = "未確定";

function normName(s: string): string {
  return s.replace(/\s+/g, "").replace(/[()（）]/g, "").trim().toLowerCase();
}
function shingles(s: string): Set<string> {
  const out = new Set<string>();
  if (s.length <= 2) {
    if (s) out.add(s);
    return out;
  }
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
function overlaps(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  for (const x of a) if (b.has(x)) return true;
  return false;
}

interface CatEntry {
  info: NtuInfo;
  norm: string;
  sh: Set<string>;
}
interface NameIndex {
  entries: CatEntry[];
  byName: Map<string, NtuInfo[]>;
}
function buildNameIndex(catalog: Map<string, NtuInfo>): NameIndex {
  const entries: CatEntry[] = [];
  const byName = new Map<string, NtuInfo[]>();
  for (const info of catalog.values()) {
    if (!info.name) continue;
    const norm = normName(info.name);
    entries.push({ info, norm, sh: shingles(norm) });
    const list = byName.get(norm);
    if (list) list.push(info);
    else byName.set(norm, [info]);
  }
  return { entries, byName };
}

/** Merge several catalog entries (same name) into one classification view. */
function mergeInfos(list: NtuInfo[]): NtuInfo {
  const m: NtuInfo = {
    pk: list[0].pk, name: list[0].name, categories: new Set(), credits: null,
    ge: new Set(), depts: new Set(), slots: new Set(), requirements: [],
  };
  for (const i of list) {
    for (const c of i.categories) m.categories.add(c);
    for (const g of i.ge) m.ge.add(g);
    for (const d of i.depts) m.depts.add(d);
    for (const s of i.slots) m.slots.add(s);
    if (i.credits != null) m.credits = i.credits;
    m.requirements.push(...i.requirements);
  }
  return m;
}

/**
 * Find a 114-1 catalog entry for a renamed course by name similarity, using a
 * shared time slot as an auxiliary boost. Returns null if nothing is similar
 * enough (caller then treats the course as 通識/未確定).
 */
function matchByName(
  idx: NameIndex,
  name: string | null,
  ourSlots: Set<string>
): NtuInfo | null {
  if (!name) return null;
  const norm = normName(name);
  if (!norm) return null;

  // 1) Exact normalized-name match — disambiguate by time slot when possible.
  const exact = idx.byName.get(norm);
  if (exact && exact.length) {
    const slotted = ourSlots.size ? exact.filter((i) => overlaps(i.slots, ourSlots)) : [];
    return mergeInfos(slotted.length ? slotted : exact);
  }

  // 2) Fuzzy: 2-char shingle Jaccard, +0.25 when the time slot also matches.
  const sh = shingles(norm);
  let best: NtuInfo | null = null;
  let bestScore = 0;
  for (const e of idx.entries) {
    let score = jaccard(sh, e.sh);
    if (score < 0.25) continue; // far too different to consider
    if (ourSlots.size && overlaps(e.info.slots, ourSlots)) score += 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = e.info;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

type Tier = "pk" | "name" | "none";

async function persist(
  supabase: SupabaseClient,
  courseId: string,
  courseName: string | null,
  info: NtuInfo | null,
  tier: Tier,
  deptGrades: string[],
  existingConf: Confidence | null
): Promise<"pk" | "name" | "none" | "override" | "protected"> {
  const override = courseName ? NAME_OVERRIDES.find((o) => o.match(courseName)) : undefined;

  // SAFEGUARD: a code (pk) match or an explicit override is authoritative; any
  // other outcome is a lower-confidence guess. Never let a guess overwrite an
  // already-confident classification — so a transient catalog-crawl hiccup that
  // drops a confirmed course can't silently re-bucket it into 通識/未確定.
  const authoritative = !!override?.set || tier === "pk";
  if (!authoritative && (existingConf === "medium" || existingConf === "high")) {
    return "protected";
  }

  // Base classification, in priority order:
  //   override.set → authoritative rename (we know the true class)
  //   pk match     → exact catalog match (medium)
  //   name match   → cross-semester rename recovered by name+time (low)
  //   none         → NOT confirmed 系所 必選修 → treat as 通識, 領域 未確定 (low)
  let categories: string[];
  let ge: string[];
  let credits: number | null;
  let deptCodes: string[];
  let src: string;
  let conf: Confidence;
  if (override?.set) {
    categories = [...override.set.categories];
    ge = [...(override.set.ge ?? [])].sort();
    credits = override.set.credits ?? info?.credits ?? null;
    deptCodes = [];
    src = SOURCE;
    conf = CONFIDENCE;
  } else if (info && tier === "pk") {
    categories = [...info.categories];
    ge = [...info.ge].sort();
    credits = info.credits;
    deptCodes = [...info.depts];
    src = SOURCE;
    conf = CONFIDENCE;
  } else if (info && tier === "name") {
    categories = [...info.categories];
    ge = [...info.ge].sort();
    credits = info.credits;
    deptCodes = [...info.depts];
    src = "historical_match";
    conf = "low"; // name-based, lower trust than a pk match
  } else {
    categories = ["general"]; // unconfirmed 系所 → 通識
    ge = [GE_UNDETERMINED];
    credits = null;
    deptCodes = [];
    src = "course_code_inference";
    conf = "low";
  }
  // `add` overrides layer on top (e.g. 大學英文 → +common).
  if (override?.add) {
    const set = new Set(categories);
    for (const c of override.add) set.add(c);
    categories = [...set];
  }
  const known = !!override?.set || !!info;

  const { error: metaErr } = await supabase.from("course_metadata").upsert(
    {
      course_id: courseId,
      official_semester: SEMESTER,
      official_course_code: null,
      official_course_identifier: null,
      credits,
      course_type_raw: null,
      course_type_normalized: deriveType(categories, ge.length),
      categories,
      dept_codes: deptCodes,
      dept_grades: deptGrades,
      is_general_education: ge.length > 0,
      ge_categories: ge,
      ge_labels: ge.map((c) => GE_AREA_LABELS[c]).filter(Boolean),
      ge_creditable: ge.length > 0 && !ge.includes(GE_UNDETERMINED) ? true : null,
      source: src,
      confidence: conf,
      matched_semester: known ? SEMESTER : null,
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
  return override?.set ? "override" : tier;
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
    try {
      gradesByPk = await fetchDeptGrades(SEMESTER, deptList, {
        delayMs: DELAY_MS,
        onDept: (id, n) => console.log(`[enrich]   dept ${id}: ${n}`),
      });
      console.log(`[enrich] grade crawl: ${gradesByPk.size} courses tagged.`);
    } catch (err) {
      // The grade crawl is a long, fragile Playwright session. If it dies, don't
      // fail the whole run — keep partial results and preserve existing buckets.
      console.warn(`[enrich] grade crawl failed (${(err as Error).message}); preserving existing dept_grades.`);
    }
  }

  // Time slots per course (weekday-period), for the rename time-match aid.
  const slotsByCourse = new Map<string, Set<string>>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("course_sessions")
      .select("course_id, weekday, periods")
      .range(from, from + 999);
    const rows = (data ?? []) as { course_id: string; weekday: number | null; periods: string[] | null }[];
    for (const s of rows) {
      if (s.weekday == null) continue;
      const set = slotsByCourse.get(s.course_id) ?? new Set<string>();
      for (const p of s.periods ?? []) set.add(`${s.weekday}-${p}`);
      slotsByCourse.set(s.course_id, set);
    }
    if (rows.length < 1000) break;
  }
  const nameIndex = buildNameIndex(catalog);

  // Existing per-course state: confidence (safeguard reads it to avoid
  // downgrading) and dept_grades (preserved when this run skips/loses the
  // fragile grade crawl, so we never wipe grade buckets).
  const existingConf = new Map<string, Confidence>();
  const existingGrades = new Map<string, string[]>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("course_metadata")
      .select("course_id, confidence, dept_grades")
      .range(from, from + 999);
    const rows = (data ?? []) as { course_id: string; confidence: Confidence; dept_grades: string[] | null }[];
    for (const r of rows) {
      existingConf.set(r.course_id, r.confidence);
      if (r.dept_grades?.length) existingGrades.set(r.course_id, r.dept_grades);
    }
    if (rows.length < 1000) break;
  }

  const counts = { pk: 0, name: 0, none: 0, override: 0, protected: 0 };
  const skipped: string[] = [];
  const nmSamples: string[] = [];
  const udSamples: string[] = [];
  for (const course of courses) {
    let info = course.pk ? catalog.get(course.pk) ?? null : null;
    let tier: Tier = info ? "pk" : "none";
    if (!info) {
      const m = matchByName(nameIndex, course.course_name, slotsByCourse.get(course.id) ?? new Set());
      if (m) {
        info = m;
        tier = "name";
      }
    }
    // Fresh grade buckets from this run, else preserve the existing ones (so a
    // skipped/failed grade crawl never wipes them).
    const fresh = course.pk ? gradesByPk.get(course.pk) : undefined;
    const deptGrades = fresh && fresh.size ? [...fresh] : existingGrades.get(course.id) ?? [];
    try {
      const outcome = await persist(
        supabase, course.id, course.course_name, info, tier, deptGrades,
        existingConf.get(course.id) ?? null
      );
      counts[outcome]++;
      if (outcome === "name" && nmSamples.length < 12) nmSamples.push(`${course.course_name} ← ${info?.name}`);
      if (outcome === "none" && udSamples.length < 12) udSamples.push(`${course.course_name}`);
    } catch (err) {
      skipped.push((err as Error).message);
    }
  }
  console.log(
    `[enrich] done. 確定[pk=${counts.pk} override=${counts.override}] ` +
    `不確定[nameMatch=${counts.name} 通識/未確定=${counts.none}] ` +
    `protected(未降級)=${counts.protected} skipped=${skipped.length}`
  );
  console.log("[enrich] name-match samples:\n  " + nmSamples.join("\n  "));
  console.log("[enrich] 未確定 samples:\n  " + udSamples.join("\n  "));
  if (skipped.length) console.log("[enrich] first skips:", skipped.slice(0, 3));
}

main().catch((err) => {
  console.error("[enrich] failed:", err);
  process.exit(1);
});

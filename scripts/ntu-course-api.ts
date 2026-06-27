/**
 * NTU course網 (course.ntu.edu.tw) JSON API reader for classification.
 *
 * Clean JSON API behind the SPA. Each "category" tab is a search slug:
 *   dept 系所 · general 通識/溝通 · common 共同/新生 · pearmy 體育/國防 ·
 *   program 學程 · expertise 領域專長 · interschool 校際 · english 進階英語
 *   (分班編組/course-groups needs a code → not bulk-listable, excluded)
 *
 *   POST /api/v1/courses/search/<slug>?lang=zh_TW
 *   body { query:{ semester, keyword:"", ... }, batchSize, pageIndex, sorting }
 *
 * MATCH KEY: course.code + (class ? "-"+class : "")  ===  our courses.pk
 * Each course carries: credits, courseTargets[].{department, isCompulsory,
 * generalMarks:[A1..A8]}. A course is tagged with EVERY category slug it appears
 * in (a course can be in several).
 *
 * Uses Playwright only to hold a browser session (the API needs it); requests
 * are POSTed via that context.
 */

import { chromium, type Browser } from "playwright";

const BASE = "https://course.ntu.edu.tw";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** Category slugs we bulk-crawl (分班編組 needs a code → not bulk-listable). */
export const CATEGORIES: { slug: string; label: string }[] = [
  { slug: "dept", label: "系所" },
  { slug: "general", label: "通識/溝通" },
  { slug: "common", label: "共同/新生" },
  { slug: "pearmy", label: "體育/國防" },
  { slug: "program", label: "學程" },
  { slug: "expertise", label: "領域專長" },
  { slug: "interschool", label: "校際" },
  { slug: "english", label: "進階英語" },
];

// Each category's search needs its own extra query fields (empty = "all").
const CATEGORY_EXTRAS: Record<string, Record<string, unknown>> = {
  dept: { department: null, suggestedGrade: "", departmentCourseType: null, isCompulsory: null },
  general: { generalCourseTypes: [] },
  common: { commonTargetDepartments: [], commonCourseTypes: [] },
  pearmy: { peArmyCourseTypes: [] },
  program: { programs: [] },
  expertise: { departments: [], isCompulsory: null },
  interschool: { courseProviders: [] },
  english: { departments: [], isCompulsory: null },
};

export interface NtuInfo {
  pk: string;
  name: string | null; // course name (for cross-semester name matching)
  categories: Set<string>; // slugs
  credits: number | null;
  ge: Set<string>; // A1..A8
  depts: Set<string>; // offering department codes (courseTargets.department.id)
  slots: Set<string>; // "<weekday>-<interval>" time slots (rename time-match aid)
  requirements: { dept: string; compulsory: boolean | null }[];
}

interface ApiCourse {
  code: string;
  class: string | null;
  name?: string;
  credits: number | null;
  schedules?: { weekday?: number; intervals?: string[] }[];
  courseTargets?: {
    department?: { id?: string; name?: string };
    isCompulsory?: boolean | null;
    generalMarks?: string[];
  }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function bodyFor(slug: string, semester: string, pageIndex: number, batchSize: number) {
  return {
    query: {
      keyword: "",
      time: [[], [], [], [], [], []],
      timeStrictMatch: false,
      isFullYear: null,
      excludedKeywords: [],
      enrollMethods: [],
      isEnglishTaught: false,
      isDistanceLearning: false,
      hasChanged: false,
      isAdditionalCourse: false,
      noPrerequisite: false,
      isCanceled: false,
      isIntensive: false,
      semester,
      isPrecise: true,
      // Each category endpoint validates its OWN query shape; sending another
      // category's fields (or omitting required ones) yields 0 results.
      ...(CATEGORY_EXTRAS[slug] ?? {}),
    },
    batchSize,
    pageIndex,
    sorting: "correlation",
  };
}

/**
 * Crawl all categories for `semester` → Map keyed by our pk. Merges category
 * tags / GE / requirements across the categories a course appears in.
 */
export async function fetchNtuCatalog(
  semester: string,
  opts: { delayMs?: number; slugs?: string[]; onCategory?: (slug: string, n: number) => void } = {}
): Promise<Map<string, NtuInfo>> {
  const delayMs = opts.delayMs ?? 400;
  const slugs = opts.slugs ?? CATEGORIES.map((c) => c.slug);
  const batchSize = 100;
  const map = new Map<string, NtuInfo>();

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: UA });
    const page = await ctx.newPage();

    for (const slug of slugs) {
      // Must be ON the category's search page before POSTing to its endpoint.
      try {
        await page.goto(`${BASE}/search/${slug}?s=${semester}`, {
          waitUntil: "domcontentloaded",
          timeout: 45000,
        });
        await sleep(800);
      } catch {
        /* continue; the POST may still work */
      }
      let count = 0;
      for (let pageIndex = 0; ; pageIndex++) {
        let json: { courses?: ApiCourse[] } | null = null;
        try {
          const res = await page.request.post(
            `${BASE}/api/v1/courses/search/${slug}?lang=zh_TW`,
            {
              headers: {
                "content-type": "application/json",
                accept: "application/json, text/plain, */*",
                referer: `${BASE}/search/${slug}?s=${semester}`,
              },
              data: bodyFor(slug, semester, pageIndex, batchSize),
              timeout: 30000,
            }
          );
          if (res.ok()) json = await res.json();
        } catch {
          /* skip page on transient error */
        }
        const courses = json?.courses ?? [];
        for (const c of courses) {
          if (!c.code) continue;
          const pk = c.class ? `${c.code}-${c.class}` : c.code;
          let info = map.get(pk);
          if (!info) {
            info = {
              pk, name: c.name ?? null, categories: new Set(), credits: null,
              ge: new Set(), depts: new Set(), slots: new Set(), requirements: [],
            };
            map.set(pk, info);
          }
          if (!info.name && c.name) info.name = c.name;
          info.categories.add(slug);
          if (c.credits != null) info.credits = c.credits;
          for (const s of c.schedules ?? []) {
            if (s.weekday == null) continue;
            for (const iv of s.intervals ?? []) info.slots.add(`${s.weekday}-${iv}`);
          }
          for (const t of c.courseTargets ?? []) {
            for (const g of t.generalMarks ?? []) if (/^A[1-8]$/.test(g)) info.ge.add(g);
            if (t.department?.id) info.depts.add(t.department.id);
            const dept = t.department?.name;
            if (dept && dept !== "default") {
              info.requirements.push({ dept, compulsory: t.isCompulsory ?? null });
            }
          }
        }
        count += courses.length;
        if (courses.length < batchSize) break; // last page
        await sleep(delayMs);
      }
      opts.onCategory?.(slug, count);
      await sleep(delayMs);
    }
  } finally {
    if (browser) await browser.close();
  }
  return map;
}

/**
 * Crawl the 系所 search per (department, grade) to learn which courses fall in
 * each grade bucket — course網 segments grades server-side via `suggestedGrade`,
 * with no plain field on the course, so this is the only faithful source.
 *
 * Returns Map<pk, Set<"deptId:gradeId">>. Pass only the departments you care
 * about (e.g. those your courses actually belong to) to keep the crawl small.
 */
export async function fetchDeptGrades(
  semester: string,
  depts: { id: string; gradeIds: string[] }[],
  opts: { delayMs?: number; onDept?: (id: string, n: number) => void } = {}
): Promise<Map<string, Set<string>>> {
  const delayMs = opts.delayMs ?? 400;
  const batchSize = 100;
  const map = new Map<string, Set<string>>();

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: UA });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/search/dept?s=${semester}`, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      await sleep(800);
    } catch {
      /* the POST may still work */
    }

    for (const dept of depts) {
      let total = 0;
      for (const gradeId of dept.gradeIds) {
        for (let pageIndex = 0; ; pageIndex++) {
          let json: { courses?: ApiCourse[] } | null = null;
          try {
            const res = await page.request.post(
              `${BASE}/api/v1/courses/search/dept?lang=zh_TW`,
              {
                headers: {
                  "content-type": "application/json",
                  accept: "application/json, text/plain, */*",
                  referer: `${BASE}/search/dept?s=${semester}`,
                },
                data: {
                  query: {
                    keyword: "", time: [[], [], [], [], [], []], timeStrictMatch: false,
                    isFullYear: null, excludedKeywords: [], enrollMethods: [],
                    isEnglishTaught: false, isDistanceLearning: false, hasChanged: false,
                    isAdditionalCourse: false, noPrerequisite: false, isCanceled: false,
                    isIntensive: false, semester, isPrecise: true,
                    department: dept.id, suggestedGrade: gradeId,
                    departmentCourseType: null, isCompulsory: null,
                  },
                  batchSize, pageIndex, sorting: "correlation",
                },
                timeout: 30000,
              }
            );
            if (res.ok()) json = await res.json();
          } catch {
            /* skip page on transient error */
          }
          const courses = json?.courses ?? [];
          for (const c of courses) {
            if (!c.code) continue;
            const pk = c.class ? `${c.code}-${c.class}` : c.code;
            let set = map.get(pk);
            if (!set) { set = new Set(); map.set(pk, set); }
            set.add(`${dept.id}:${gradeId}`);
          }
          total += courses.length;
          if (courses.length < batchSize) break;
          await sleep(delayMs);
        }
        await sleep(delayMs);
      }
      opts.onDept?.(dept.id, total);
    }
  } finally {
    if (browser) await browser.close();
  }
  return map;
}

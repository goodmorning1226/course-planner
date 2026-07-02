// Zod schemas for server-side validation. Never trust client input.

import { z } from "zod";
import { MAX_SEMESTER } from "@/lib/reviews/key";

/** Auth: password rule is intentionally lenient — min 8 chars, no extras. */
export const credentialsSchema = z.object({
  email: z.string().email("請輸入有效的 email"),
  password: z.string().min(8, "密碼至少 8 個字元"),
});
export type Credentials = z.infer<typeof credentialsSchema>;

/**
 * Cursor for keyset pagination. Opaque to the client; we only allow a bounded,
 * safe charset (base64url-ish + a ":" separator) so it can't be abused.
 */
const cursorSchema = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9:_.\-]+$/, "cursor 格式不合法");

// Course網 category slugs (the 課程大類 filter is now multi-category).
const CATEGORY_SLUGS = [
  "dept", "general", "common", "pearmy", "program",
  "expertise", "interschool", "english", "uncategorized",
] as const;
const REQUIREMENT_VALUES = [
  "required", "elective", "required_elective", "optional_required",
  "college_required", "college_elective", "common_required", "common_elective", "unknown",
] as const;
const SOURCE_VALUES = [
  "official_1151", "historical_match", "course_code_inference", "unknown",
] as const;

/** Query params for GET /api/courses (course search). */
export const courseSearchQuerySchema = z.object({
  q: z.string().trim().max(100, "搜尋字串最多 100 字").optional(),
  // Multi-select filters arrive as comma-separated lists (OR within a group).
  weekday: z
    .string()
    .regex(/^[1-7](,[1-7])*$/, "weekday 不合法")
    .optional(),
  period: z
    .string()
    .regex(/^(10|[0-9]|[A-D])(,(10|[0-9]|[A-D]))*$/, "period 不合法")
    .optional(),
  // Comma-separated 建物/學院 labels (exact match list).
  buildingOrCollege: z.string().trim().max(300).optional(),
  teacher: z.string().trim().max(100).optional(),
  // Classification filters (course_metadata / course_requirements).
  courseType: z.enum(CATEGORY_SLUGS).optional(), // category slug
  // 系所大類: one or many dept codes (e.g. "1010,2010"); 4-char alnum codes.
  dept: z.string().regex(/^[0-9A-Za-z]{3,5}(,[0-9A-Za-z]{3,5})*$/, "dept 不合法").optional(),
  // 系所年級 bucket: single "<deptCode>:<gradeId>" token.
  deptGrade: z.string().regex(/^[0-9A-Za-z]{3,5}:.{1,3}$/, "deptGrade 不合法").optional(),
  isGeneralEducation: z.enum(["true", "false"]).optional(),
  // 通識領域: one or many of A1–A8 (OR).
  geCategory: z
    .string()
    .regex(/^A[1-8](,A[1-8])*$/, "geCategory 不合法")
    .optional(),
  targetDepartment: z.string().trim().max(100).optional(),
  requirement: z.enum(REQUIREMENT_VALUES).optional(),
  classificationSource: z.enum(SOURCE_VALUES).optional(),
  classificationConfidence: z.enum(["high", "medium", "low", "unknown"]).optional(),
  // Soft-delete: hide 停開 (status='removed') courses. Default shows them, marked.
  hideRemoved: z.enum(["true", "false"]).optional(),
  // Restrict results to a set of course ids (comma-separated). Used to fetch the
  // "pinned" courses (already in the user's timetable) that match a search, so
  // they can be floated to the top of the results.
  ids: z.string().trim().max(4000).optional(),
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
export type CourseSearchQuery = z.infer<typeof courseSearchQuerySchema>;

/**
 * Body for POST /api/admin/scrape — pick which section to (re-)scrape:
 *   'all'    full crawl (every building + 其他) + classify new
 *   'ntust'  台科 校際 live-API refresh
 *   '%'      其他 (orphan rooms)
 *   <value>  a single BuildingDDL value (e.g. '1')
 */
export const scrapeSectionBodySchema = z.object({
  section: z
    .string()
    .trim()
    .regex(/^(all|ntust|%|[A-Za-z0-9]{1,16})$/, "section 不合法")
    .default("all"),
});
export type ScrapeSectionBody = z.infer<typeof scrapeSectionBodySchema>;

/**
 * Body for POST / DELETE /api/timetable/courses. The caller only supplies the
 * course; the server resolves the current user's timetable itself.
 */
export const timetableCourseBodySchema = z.object({
  courseId: z.string().uuid("無效的課程 id"),
});
export type TimetableCourseBody = z.infer<typeof timetableCourseBodySchema>;

/**
 * Body for POST /api/scrape — trigger the low-frequency scraper. The body is
 * optional; when omitted the scraper uses its env defaults. Auth is via the
 * SCRAPE_ADMIN_SECRET header, not the body.
 */
/**
 * Body for POST /api/admin/classify — an admin manually assigns categories to a
 * course (used to clear 未分類). At least one REAL category (never 未分類).
 */
const ASSIGNABLE_SLUGS = CATEGORY_SLUGS.filter((s) => s !== "uncategorized") as Exclude<
  (typeof CATEGORY_SLUGS)[number],
  "uncategorized"
>[];
// --- 修課情報：課程評價 + 成績分布 -------------------------------------------

// 115 學期尚未開始 → 學期最晚只到 114-2（固定寬度，字串比較即可）。
const SEMESTER = z
  .string()
  .regex(/^\d{3}-[12]$/, "學期格式不合法")
  .refine((s) => s <= MAX_SEMESTER, `學期不可晚於 ${MAX_SEMESTER}`);
const HALF_STAR = z
  .number()
  .refine((v) => [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].includes(v), "評分需為 0.5 倍數，介於 0.5–5");
const PERCENT = z.number().min(0, "不可小於 0").max(100, "不可大於 100").nullable().optional();

/** Query for GET /api/reviews + /api/grades — identify the course. */
export const courseInfoQuerySchema = z.object({
  name: z.string().trim().min(1).max(200),
  teacher: z.string().trim().max(100).optional(),
});

/** Body for POST/PUT /api/reviews — create or edit own review. */
export const reviewBodySchema = z.object({
  courseName: z.string().trim().min(1, "缺少課名").max(200),
  teacher: z.string().trim().max(100).optional().nullable(),
  semester: SEMESTER,
  overall: HALF_STAR,
  // 甜度／涼度為選填：未評分時可省略或傳 null。
  sweet: HALF_STAR.nullable().optional(),
  chill: HALF_STAR.nullable().optional(),
  solid: HALF_STAR,
  comment: z.string().trim().max(500, "評論最多 500 字").optional().nullable(),
});
export type ReviewBody = z.infer<typeof reviewBodySchema>;

/** Body for POST /api/reviews/[id]/report. */
export const reportBodySchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

/** Body for POST /api/grades — submit/edit a grade distribution. */
export const gradeBodySchema = z.object({
  courseName: z.string().trim().min(1, "缺少課名").max(200),
  teacher: z.string().trim().max(100).optional().nullable(),
  semester: SEMESTER,
  aPlus: PERCENT, a: PERCENT, aMinus: PERCENT,
  bPlus: PERCENT, b: PERCENT, bMinus: PERCENT,
  cPlus: PERCENT, c: PERCENT, cMinus: PERCENT,
  f: PERCENT,
  note: z.string().trim().max(300).optional().nullable(),
});
export type GradeBody = z.infer<typeof gradeBodySchema>;

/** Body for POST /api/grade-reports — a student's relative grade report
 *  (A 版): their own grade + the three numbers NTU shows them. */
const GRADE_LETTERS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "F"] as const;
const REQUIRED_PERCENT = z.number().min(0, "不可小於 0").max(100, "不可大於 100");
export const gradeReportBodySchema = z
  .object({
    courseName: z.string().trim().min(1, "缺少課名").max(200),
    teacher: z.string().trim().max(100).optional().nullable(),
    semester: SEMESTER,
    pivot: z.enum(GRADE_LETTERS),
    samePct: REQUIRED_PERCENT, // 與你同等第的比例（唯一精確值）
    abovePct: REQUIRED_PERCENT.optional().nullable(), // 高於你的比例
    belowPct: REQUIRED_PERCENT.optional().nullable(), // 低於你的比例
    // 使用者已確認「與現有資料衝突仍要送出」→ 略過衝突提示、照常保存。
    force: z.boolean().optional(),
  })
  // A+ has nothing above it; F has nothing below it — those lumps can't exist.
  .refine((v) => !(v.pivot === "A+" && (v.abovePct ?? 0) > 0), {
    message: "A+ 之上沒有更高等第，「高於你」不可填。",
    path: ["abovePct"],
  })
  .refine((v) => !(v.pivot === "F" && (v.belowPct ?? 0) > 0), {
    message: "F 之下沒有更低等第，「低於你」不可填。",
    path: ["belowPct"],
  })
  // 以上/以下必填（A+ 免以上、F 免以下）— epo 一定同時顯示三者。
  .refine((v) => v.pivot === "A+" || v.abovePct != null, {
    message: "請填「高於你」的比例。",
    path: ["abovePct"],
  })
  .refine((v) => v.pivot === "F" || v.belowPct != null, {
    message: "請填「低於你」的比例。",
    path: ["belowPct"],
  });
export type GradeReportBody = z.infer<typeof gradeReportBodySchema>;

/** Body for DELETE /api/grade-reports — remove the viewer's own report for a
    course identity + semester. */
export const gradeReportDeleteSchema = z.object({
  courseName: z.string().trim().min(1, "缺少課名").max(200),
  teacher: z.string().trim().max(100).optional().nullable(),
  semester: SEMESTER,
});
export type GradeReportDelete = z.infer<typeof gradeReportDeleteSchema>;

export const manualClassifySchema = z.object({
  courseId: z.string().uuid("無效的課程 id"),
  categories: z
    .array(z.enum(ASSIGNABLE_SLUGS as [string, ...string[]]))
    .min(1, "至少選一個類別")
    .max(9),
  geCategories: z
    .array(z.string().regex(/^A[1-8]$/, "通識領域不合法"))
    .max(8)
    .optional()
    .default([]),
});
export type ManualClassify = z.infer<typeof manualClassifySchema>;

export const scrapeRequestSchema = z.object({
  // NTU semester, e.g. "115-1" or "1151".
  semester: z
    .string()
    .trim()
    .regex(/^\d{3}-?\d$/, "學期格式不合法 (例如 115-1 或 1151)")
    .optional(),
  // Optional dry run: scrape & parse but do not write.
  dry_run: z.boolean().optional().default(false),
});
export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>;

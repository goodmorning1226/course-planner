// Zod schemas for server-side validation. Never trust client input.

import { z } from "zod";

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
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
export type CourseSearchQuery = z.infer<typeof courseSearchQuerySchema>;

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

import { NextResponse } from "next/server";
import { createPublicServerClient } from "@/lib/supabase/server";
import { courseSearchQuerySchema } from "@/lib/validations";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";
import type {
  Course,
  CourseSession,
  CourseMetadata,
  CourseRequirement,
  CourseWithSessionsAndMetadata,
} from "@/lib/courses/types";

// GET /api/courses — search courses (reads our own DB, never NTU directly).
//
// Returns { data: CourseWithSessions[]; nextCursor: string | null } with
// cursor-based (offset) pagination for infinite scroll.
//
// Query strategy (kept simple & stable, no N+1):
//   1. Session-level filters (weekday / period / classroom) are applied as an
//      embedded INNER join on course_sessions, so a course is included iff it
//      has a session matching them — and pagination stays on `courses`.
//   2. `q` searches course_name / teacher / pk (on courses) AND classroom (on
//      sessions, resolved via one bounded pre-query), combined as an OR group.
//   3. One paged courses query (limit + 1 rows) + ONE sessions query for the
//      returned page. Relevance ordering (req: pk-exact > name > teacher) is
//      applied to the page.

/** Generous cap for the classroom-search pre-query (q matching classrooms). */
const Q_CLASSROOM_ID_CAP = 300;

/** Remove characters that are structural in PostgREST's or() grammar. */
function sanitizeForOr(s: string): string {
  return s.replace(/[(),]/g, "").trim();
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): number | null {
  try {
    const n = parseInt(Buffer.from(cursor, "base64url").toString("utf8"), 10);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/** Relevance rank for ordering when a query is present (lower = better). */
function relevanceRank(c: Course, q: string): number {
  if (c.pk && c.pk === q) return 0;
  if (c.course_name && c.course_name.includes(q)) return 1;
  if (c.teacher && c.teacher.includes(q)) return 2;
  return 3;
}

export async function GET(req: Request) {
  // 9. Basic rate limit.
  const rl = rateLimit(
    clientKey(req, "courses"),
    RATE_LIMITS.search.limit,
    RATE_LIMITS.search.windowMs
  );
  if (!rl.ok) return rateLimited(rl.resetAt);

  // 8. Server-side validation (unknown query keys are stripped → whitelist).
  const { searchParams } = new URL(req.url);
  const parsed = courseSearchQuerySchema.safeParse(
    Object.fromEntries(searchParams)
  );
  if (!parsed.success) {
    return apiError("invalid_request", "查詢參數不合法。");
  }
  const {
    q, weekday, period, buildingOrCollege, teacher,
    courseType, dept, deptGrade,
    isGeneralEducation, geCategory, targetDepartment, requirement,
    classificationSource, classificationConfidence,
    cursor, limit,
  } = parsed.data;

  // 系所大類: dept codes (OR) via array-overlaps on course_metadata.dept_codes.
  const deptCodes = dept ? dept.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  // Multi-select filters: comma lists → arrays (OR within each group).
  const weekdays = weekday ? weekday.split(",").map(Number) : undefined;
  const periods = period ? period.split(",") : undefined;
  const buildings = buildingOrCollege
    ? buildingOrCollege.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  // 通識領域 A1–A8: one or many areas (OR within the group).
  const geCategories = geCategory
    ? geCategory.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  let offset = 0;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded === null) {
      return apiError("invalid_request", "cursor 格式不合法。");
    }
    offset = decoded;
  }

  try {
    // Public, cookie-free client → response is safely CDN-cacheable.
    const supabase = createPublicServerClient();
    const hasSessionFilter =
      (weekdays?.length ?? 0) > 0 || (periods?.length ?? 0) > 0;
    const hasMetaFilter =
      !!courseType || !!isGeneralEducation || !!geCategory ||
      !!classificationSource || !!classificationConfidence ||
      (deptCodes?.length ?? 0) > 0 || !!deptGrade;
    const hasReqFilter = !!targetDepartment || !!requirement;

    // q also searches classroom (a session column): resolve matching course ids.
    let qClassroomIds: string[] = [];
    if (q) {
      const { data, error } = await supabase
        .from("course_sessions")
        .select("course_id")
        .ilike("classroom", `%${q}%`)
        .limit(Q_CLASSROOM_ID_CAP);
      if (error) throw error;
      qClassroomIds = Array.from(
        new Set((data ?? []).map((r) => r.course_id as string))
      );
    }

    // Build the courses query. Each active filter group adds an INNER embed so
    // a course is included iff it has a matching child row.
    const selectStr =
      "*" +
      (hasSessionFilter ? ", course_sessions!inner(course_id)" : "") +
      (hasMetaFilter ? ", course_metadata!inner(course_id)" : "") +
      (hasReqFilter ? ", course_requirements!inner(course_id)" : "");
    let cq = supabase.from("courses").select(selectStr, { count: "exact" });

    // (1) Session-level filters via embedded inner join (EXISTS semantics).
    // A matching session must be on one of the selected weekdays AND have at
    // least one of the selected periods.
    if (weekdays?.length) cq = cq.in("course_sessions.weekday", weekdays);
    if (periods?.length)
      cq = cq.overlaps("course_sessions.periods", periods);

    // (1b) Classification filters (course_metadata, to-one).
    if (courseType) cq = cq.contains("course_metadata.categories", [courseType]);
    // 系所大類: any of the selected departments (overlaps); a single dept may
    // additionally narrow to a 年級 bucket (contains the deptCode:gradeId token).
    if (deptCodes?.length)
      cq = cq.overlaps("course_metadata.dept_codes", deptCodes);
    if (deptGrade) cq = cq.contains("course_metadata.dept_grades", [deptGrade]);
    if (isGeneralEducation)
      cq = cq.eq("course_metadata.is_general_education", isGeneralEducation === "true");
    if (geCategories?.length)
      cq = cq.overlaps("course_metadata.ge_categories", geCategories);
    if (classificationSource) cq = cq.eq("course_metadata.source", classificationSource);
    if (classificationConfidence)
      cq = cq.eq("course_metadata.confidence", classificationConfidence);

    // (1c) Requirement filters (course_requirements, to-many).
    if (targetDepartment)
      cq = cq.ilike("course_requirements.target_department_name", `%${targetDepartment}%`);
    if (requirement)
      cq = cq.eq("course_requirements.requirement_normalized", requirement);

    // Course-level filters: building/college is an exact-label list (OR).
    if (buildings?.length) cq = cq.in("building_or_college", buildings);
    if (teacher) cq = cq.ilike("teacher", `%${teacher}%`);

    // (2) Free-text search OR group.
    if (q) {
      const safe = sanitizeForOr(q);
      const ors: string[] = [];
      if (safe) {
        ors.push(`pk.eq.${safe}`);
        ors.push(`course_name.ilike.*${safe}*`);
        ors.push(`teacher.ilike.*${safe}*`);
      }
      if (qClassroomIds.length > 0) {
        ors.push(`id.in.(${qClassroomIds.join(",")})`);
      }
      if (ors.length > 0) cq = cq.or(ors.join(","));
    }

    // Stable base ordering + paginate (fetch limit + 1 to detect "more").
    cq = cq
      .order("course_name", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + limit);

    const { data: rawRows, error, count: total } = await cq;
    if (error) throw error;

    const rows = (rawRows ?? []) as unknown as (Course & {
      course_sessions?: unknown;
    })[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? encodeCursor(offset + limit) : null;

    // (3) Sessions + metadata + requirements for the returned page — 3 queries,
    // no N+1.
    const pageIds = pageRows.map((r) => r.id);
    const sessionsByCourse = new Map<string, CourseSession[]>();
    const metaByCourse = new Map<string, CourseMetadata>();
    const reqsByCourse = new Map<string, CourseRequirement[]>();
    if (pageIds.length > 0) {
      const [sessR, metaR, reqR] = await Promise.all([
        supabase.from("course_sessions").select("*").in("course_id", pageIds),
        supabase.from("course_metadata").select("*").in("course_id", pageIds),
        supabase.from("course_requirements").select("*").in("course_id", pageIds),
      ]);
      if (sessR.error) throw sessR.error;
      // metadata / requirements are tolerant: if the enrichment tables aren't
      // migrated yet, base search still works (courses just show 尚未分類).
      if (metaR.error || reqR.error) {
        console.warn("[/api/courses] classification tables unavailable:",
          metaR.error?.message ?? reqR.error?.message);
      }
      for (const s of (sessR.data ?? []) as CourseSession[]) {
        const list = sessionsByCourse.get(s.course_id) ?? [];
        list.push(s);
        sessionsByCourse.set(s.course_id, list);
      }
      for (const m of (metaR.data ?? []) as CourseMetadata[]) {
        // Redact internal certainty signals — users must not see the
        // classification confidence/source (確定/不確定 is server-side only).
        const { source: _src, confidence: _conf, ...pub } = m;
        void _src; void _conf;
        metaByCourse.set(m.course_id, pub as CourseMetadata);
      }
      for (const r of (reqR.data ?? []) as CourseRequirement[]) {
        const list = reqsByCourse.get(r.course_id) ?? [];
        list.push(r);
        reqsByCourse.set(r.course_id, list);
      }
    }

    const data: CourseWithSessionsAndMetadata[] = pageRows.map((row) => {
      // Strip the embedded join helpers; keep only Course columns.
      const {
        course_sessions: _s,
        course_metadata: _m,
        course_requirements: _r,
        ...course
      } = row as Course & {
        course_sessions?: unknown;
        course_metadata?: unknown;
        course_requirements?: unknown;
      };
      return {
        ...(course as Course),
        sessions: sessionsByCourse.get(course.id) ?? [],
        metadata: metaByCourse.get(course.id) ?? null,
        requirements: reqsByCourse.get(course.id) ?? [],
      };
    });

    // 11. Relevance ordering for the page when a query is present.
    if (q) {
      data.sort(
        (a, b) =>
          relevanceRank(a, q) - relevanceRank(b, q) ||
          a.course_name.localeCompare(b.course_name)
      );
    }

    return NextResponse.json(
      { data, nextCursor, total: total ?? null },
      {
        // Course data is public + low-churn (scraped a couple times a day):
        // let the CDN cache popular identical queries to ease DB load.
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (err) {
    // 10. Do not leak internals to the client.
    console.error("[/api/courses] query failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

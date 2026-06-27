import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import type { Course, CourseSession } from "@/lib/courses/types";

// GET /api/admin/uncategorized?q=&offset= — list 未分類 courses for manual
// classification. Admin only. Returns courses + their sessions (for context).
const PAGE = 30;

function sanitize(s: string): string {
  return s.replace(/[(),]/g, "").trim();
}

export async function GET(req: Request) {
  if (!(await getAdminUser())) return apiError("forbidden", "沒有權限。");

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").slice(0, 100);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  try {
    const db = createServiceRoleClient();
    let cq = db
      .from("courses")
      .select("*, course_metadata!inner(categories)", { count: "exact" })
      .contains("course_metadata.categories", ["uncategorized"]);

    const safe = sanitize(q);
    if (safe) {
      cq = cq.or(
        `course_name.ilike.*${safe}*,teacher.ilike.*${safe}*,pk.ilike.*${safe}*`
      );
    }
    cq = cq
      .order("course_name", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);

    const { data: rawRows, count, error } = await cq;
    if (error) throw error;

    const rows = (rawRows ?? []) as unknown as (Course & { course_metadata?: unknown })[];
    const pageIds = rows.map((r) => r.id);
    const sessionsByCourse = new Map<string, CourseSession[]>();
    if (pageIds.length) {
      const { data: sess } = await db
        .from("course_sessions")
        .select("*")
        .in("course_id", pageIds);
      for (const s of (sess ?? []) as CourseSession[]) {
        const list = sessionsByCourse.get(s.course_id) ?? [];
        list.push(s);
        sessionsByCourse.set(s.course_id, list);
      }
    }

    const data = rows.map((row) => {
      const { course_metadata: _m, ...course } = row;
      void _m;
      return { ...(course as Course), sessions: sessionsByCourse.get(course.id) ?? [] };
    });

    const total = count ?? 0;
    return NextResponse.json({
      data,
      total,
      nextOffset: offset + PAGE < total ? offset + PAGE : null,
    });
  } catch (err) {
    console.error("[/api/admin/uncategorized] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤。");
  }
}

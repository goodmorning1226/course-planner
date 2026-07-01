import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";

// GET /api/grade-reports/me — the current user's own grade reports (for the
// 成績分布 tab on /my-reviews). RLS restricts selects to auth.uid() = user_id,
// and we additionally scope by user_id for clarity.
export interface MyGradeReport {
  id: string;
  course_name: string;
  teacher: string | null;
  semester: string;
  pivot: string;
  same_pct: number | null;
  above_pct: number | null;
  below_pct: number | null;
  created_at: string;
  updated_at: string;
}

export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-read"), RATE_LIMITS.reviewRead.limit, RATE_LIMITS.reviewRead.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  try {
    const { data, error } = await supabase
      .from("grade_reports")
      .select("id, course_name, teacher, semester, pivot, same_pct, above_pct, below_pct, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const reports: MyGradeReport[] = (data ?? []).map((r) => ({
      id: r.id as string,
      course_name: r.course_name as string,
      teacher: (r.teacher as string) ?? null,
      semester: r.semester as string,
      pivot: r.pivot as string,
      same_pct: r.same_pct != null ? Number(r.same_pct) : null,
      above_pct: r.above_pct != null ? Number(r.above_pct) : null,
      below_pct: r.below_pct != null ? Number(r.below_pct) : null,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    }));
    return NextResponse.json({ reports });
  } catch (err) {
    console.error("[/api/grade-reports/me GET] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

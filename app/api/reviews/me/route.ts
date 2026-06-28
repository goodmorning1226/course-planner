import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";
import type { CourseReview } from "@/lib/courses/types";

// GET /api/reviews/me — the current user's own reviews (for /my-reviews).
export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-read"), RATE_LIMITS.reviewRead.limit, RATE_LIMITS.reviewRead.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  try {
    const { data, error } = await supabase
      .from("course_reviews")
      .select("id, course_name, teacher, semester, rating_overall, rating_sweet, rating_chill, rating_solid, comment, like_count, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const reviews: CourseReview[] = (data ?? []).map((r) => ({
      id: r.id as string,
      course_name: r.course_name as string,
      teacher: (r.teacher as string) ?? null,
      semester: r.semester as string,
      rating_overall: Number(r.rating_overall),
      rating_sweet: Number(r.rating_sweet),
      rating_chill: Number(r.rating_chill),
      rating_solid: Number(r.rating_solid),
      comment: (r.comment as string) ?? null,
      like_count: r.like_count as number,
      report_count: 0,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      mine: true,
    }));
    return NextResponse.json({ reviews });
  } catch (err) {
    console.error("[/api/reviews/me GET] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

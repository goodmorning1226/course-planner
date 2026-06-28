import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { reviewBodySchema } from "@/lib/validations";
import { courseInfoQuerySchema } from "@/lib/validations";
import { matchKey } from "@/lib/reviews/key";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";
import type { CourseReview, ReviewAggregate } from "@/lib/courses/types";

// GET /api/reviews?name=&teacher= — public: aggregate + list (with mine/liked
// flags when logged in). POST — create/edit own review (one per course+semester).
// DELETE — remove own review.

type Row = {
  id: string; user_id: string; course_name: string; teacher: string | null; semester: string;
  rating_overall: number; rating_sweet: number; rating_chill: number; rating_solid: number;
  comment: string | null; like_count: number; created_at: string; updated_at: string;
};

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-read"), RATE_LIMITS.reviewRead.limit, RATE_LIMITS.reviewRead.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const { searchParams } = new URL(req.url);
  const parsed = courseInfoQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return apiError("invalid_request", "查詢參數不合法。");
  const key = matchKey(parsed.data.name, parsed.data.teacher ?? null);

  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("course_reviews")
      .select("id, user_id, course_name, teacher, semester, rating_overall, rating_sweet, rating_chill, rating_solid, comment, like_count, created_at, updated_at")
      .eq("match_key", key)
      .order("like_count", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as Row[];

    // Which of these did the current user like?
    let likedSet = new Set<string>();
    if (user && rows.length) {
      const svc = createServiceRoleClient();
      const { data: likes } = await svc
        .from("review_likes")
        .select("review_id")
        .eq("user_id", user.id)
        .in("review_id", rows.map((r) => r.id));
      likedSet = new Set((likes ?? []).map((l) => l.review_id as string));
    }

    const aggregate: ReviewAggregate = {
      count: rows.length,
      overall: avg(rows.map((r) => Number(r.rating_overall))),
      sweet: avg(rows.map((r) => Number(r.rating_sweet))),
      chill: avg(rows.map((r) => Number(r.rating_chill))),
      solid: avg(rows.map((r) => Number(r.rating_solid))),
    };
    const reviews: CourseReview[] = rows.map((r) => ({
      id: r.id,
      course_name: r.course_name,
      teacher: r.teacher,
      semester: r.semester,
      rating_overall: Number(r.rating_overall),
      rating_sweet: Number(r.rating_sweet),
      rating_chill: Number(r.rating_chill),
      rating_solid: Number(r.rating_solid),
      comment: r.comment,
      like_count: r.like_count,
      report_count: 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
      liked: likedSet.has(r.id),
      mine: !!user && r.user_id === user.id,
    }));

    return NextResponse.json({ aggregate, reviews });
  } catch (err) {
    console.error("[/api/reviews GET] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-write"), RATE_LIMITS.reviewWrite.limit, RATE_LIMITS.reviewWrite.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  const body = await req.json().catch(() => null);
  const parsed = reviewBodySchema.safeParse(body);
  if (!parsed.success) return apiError("invalid_request", parsed.error.issues[0]?.message ?? "請求內容不合法。");
  const b = parsed.data;

  try {
    // RLS enforces auth.uid() = user_id; upsert keeps one row per course+semester.
    const { error } = await supabase.from("course_reviews").upsert(
      {
        user_id: user.id,
        course_name: b.courseName,
        teacher: b.teacher ?? null,
        match_key: matchKey(b.courseName, b.teacher ?? null),
        semester: b.semester,
        rating_overall: b.overall,
        rating_sweet: b.sweet,
        rating_chill: b.chill,
        rating_solid: b.solid,
        comment: b.comment?.trim() ? b.comment.trim() : null,
      },
      { onConflict: "user_id,match_key,semester" }
    );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/reviews POST] failed:", err);
    return apiError("internal_error", "儲存失敗，請稍後再試。");
  }
}

export async function DELETE(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-write"), RATE_LIMITS.reviewWrite.limit, RATE_LIMITS.reviewWrite.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  const body = await req.json().catch(() => null);
  const reviewId = typeof body?.reviewId === "string" ? body.reviewId : "";
  if (!/^[0-9a-f-]{36}$/i.test(reviewId)) return apiError("invalid_request", "無效的評論 id。");

  try {
    const { error } = await supabase.from("course_reviews").delete().eq("id", reviewId); // RLS: own only
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/reviews DELETE] failed:", err);
    return apiError("internal_error", "刪除失敗，請稍後再試。");
  }
}

import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";

// POST/DELETE /api/reviews/[id]/like — toggle the current user's like. Likes go
// through service-role (after auth) and keep course_reviews.like_count in sync.

async function recount(svc: ReturnType<typeof createServiceRoleClient>, reviewId: string) {
  const { count } = await svc.from("review_likes").select("*", { count: "exact", head: true }).eq("review_id", reviewId);
  const like_count = count ?? 0;
  await svc.from("course_reviews").update({ like_count }).eq("id", reviewId);
  return like_count;
}

async function requireUser() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rl = rateLimit(clientKey(req, "reviews-write"), RATE_LIMITS.reviewWrite.limit, RATE_LIMITS.reviewWrite.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);
  const user = await requireUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  try {
    const svc = createServiceRoleClient();
    await svc.from("review_likes").upsert(
      { review_id: params.id, user_id: user.id },
      { onConflict: "review_id,user_id", ignoreDuplicates: true }
    );
    const like_count = await recount(svc, params.id);
    return NextResponse.json({ liked: true, like_count });
  } catch (err) {
    console.error("[/api/reviews/like POST] failed:", err);
    return apiError("internal_error", "操作失敗，請稍後再試。");
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const rl = rateLimit(clientKey(req, "reviews-write"), RATE_LIMITS.reviewWrite.limit, RATE_LIMITS.reviewWrite.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);
  const user = await requireUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  try {
    const svc = createServiceRoleClient();
    await svc.from("review_likes").delete().eq("review_id", params.id).eq("user_id", user.id);
    const like_count = await recount(svc, params.id);
    return NextResponse.json({ liked: false, like_count });
  } catch (err) {
    console.error("[/api/reviews/like DELETE] failed:", err);
    return apiError("internal_error", "操作失敗，請稍後再試。");
  }
}

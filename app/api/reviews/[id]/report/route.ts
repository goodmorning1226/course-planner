import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { reportBodySchema } from "@/lib/validations";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";

// POST /api/reviews/[id]/report — flag a review. One per user per review.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rl = rateLimit(clientKey(req, "reviews-write"), RATE_LIMITS.reviewWrite.limit, RATE_LIMITS.reviewWrite.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("unauthorized", "請先登入。");

  const body = await req.json().catch(() => ({}));
  const parsed = reportBodySchema.safeParse(body ?? {});
  if (!parsed.success) return apiError("invalid_request", "請求內容不合法。");

  try {
    const svc = createServiceRoleClient();
    await svc.from("review_reports").upsert(
      { review_id: params.id, user_id: user.id, reason: parsed.data.reason ?? null },
      { onConflict: "review_id,user_id", ignoreDuplicates: true }
    );
    const { count } = await svc.from("review_reports").select("*", { count: "exact", head: true }).eq("review_id", params.id);
    await svc.from("course_reviews").update({ report_count: count ?? 0 }).eq("id", params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/reviews/report POST] failed:", err);
    return apiError("internal_error", "檢舉失敗，請稍後再試。");
  }
}

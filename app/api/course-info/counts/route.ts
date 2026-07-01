import { NextResponse } from "next/server";
import { createPublicServerClient } from "@/lib/supabase/server";
import { courseInfoQuerySchema } from "@/lib/validations";
import { matchKey } from "@/lib/reviews/key";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";
import { z } from "zod";

// 修課情報 counts (reviews + grade distributions) for a course identity.
//   GET  ?name=&teacher=         → { reviews, grades }                 (one course)
//   POST { pairs:[{name,teacher}] } → { counts: { matchKey: {reviews,grades} } }
// Used by the course card (batch) and the 修課情報 tabs (single). Public.

export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-read"), RATE_LIMITS.reviewRead.limit, RATE_LIMITS.reviewRead.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const { searchParams } = new URL(req.url);
  const parsed = courseInfoQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return apiError("invalid_request", "查詢參數不合法。");
  const key = matchKey(parsed.data.name, parsed.data.teacher ?? null);

  try {
    const pub = createPublicServerClient();
    const [rv, gd] = await Promise.all([
      pub.from("course_reviews").select("*", { count: "exact", head: true }).eq("match_key", key),
      pub.from("grade_distributions").select("*", { count: "exact", head: true }).eq("match_key", key),
    ]);
    return NextResponse.json({ reviews: rv.count ?? 0, grades: gd.count ?? 0 });
  } catch (err) {
    console.error("[/api/course-info/counts GET] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

const batchSchema = z.object({
  pairs: z
    .array(z.object({ name: z.string().trim().min(1).max(200), teacher: z.string().trim().max(100).optional().nullable() }))
    .max(60),
});

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-read"), RATE_LIMITS.reviewRead.limit, RATE_LIMITS.reviewRead.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const parsed = batchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("invalid_request", "請求內容不合法。");

  // Unique match keys for the requested courses.
  const keys = [...new Set(parsed.data.pairs.map((p) => matchKey(p.name, p.teacher ?? null)))];
  if (keys.length === 0) return NextResponse.json({ counts: {} });

  try {
    const pub = createPublicServerClient();
    const [rv, gd] = await Promise.all([
      pub.from("course_reviews").select("match_key, rating_overall").in("match_key", keys),
      pub.from("grade_distributions").select("match_key").in("match_key", keys),
    ]);
    type Count = { reviews: number; grades: number; rating: number | null };
    const counts: Record<string, Count> = {};
    // Running rating sum per key → averaged at the end.
    const ratingSum: Record<string, number> = {};
    for (const k of keys) {
      counts[k] = { reviews: 0, grades: 0, rating: null };
      ratingSum[k] = 0;
    }
    for (const r of rv.data ?? []) {
      const row = r as { match_key: string; rating_overall: number | null };
      const c = counts[row.match_key];
      if (c) {
        c.reviews++;
        ratingSum[row.match_key] += Number(row.rating_overall) || 0;
      }
    }
    for (const g of gd.data ?? []) {
      const c = counts[(g as { match_key: string }).match_key];
      if (c) c.grades++;
    }
    for (const k of keys) {
      if (counts[k].reviews > 0) counts[k].rating = ratingSum[k] / counts[k].reviews;
    }
    return NextResponse.json({ counts });
  } catch (err) {
    console.error("[/api/course-info/counts POST] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

import { NextResponse } from "next/server";
import { createPublicServerClient, createServiceRoleClient } from "@/lib/supabase/server";
import { courseInfoQuerySchema } from "@/lib/validations";
import { matchKey } from "@/lib/reviews/key";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";
import { z } from "zod";

// 修課情報 counts (reviews + grade distributions) for a course identity.
//   GET  ?name=&teacher=         → { reviews, grades }                 (one course)
//   POST { pairs:[{name,teacher}] } → { counts: { matchKey: {reviews,grades} } }
// Used by the course card (batch) and the 修課情報 tabs (single). Public.
//
// `grades` = number of DISTINCT semesters shown = union of imported
// grade_distributions semesters AND first-hand grade_reports semesters, so a
// semester that only has a user report still counts. grade_reports is owner-only
// under RLS, so the (PII-free) semester read uses the service role.

export async function GET(req: Request) {
  const rl = rateLimit(clientKey(req, "reviews-read"), RATE_LIMITS.reviewRead.limit, RATE_LIMITS.reviewRead.windowMs);
  if (!rl.ok) return rateLimited(rl.resetAt);

  const { searchParams } = new URL(req.url);
  const parsed = courseInfoQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return apiError("invalid_request", "查詢參數不合法。");
  const key = matchKey(parsed.data.name, parsed.data.teacher ?? null);

  try {
    const pub = createPublicServerClient();
    const svc = createServiceRoleClient();
    const [rv, gd, gr] = await Promise.all([
      pub.from("course_reviews").select("*", { count: "exact", head: true }).eq("match_key", key),
      pub.from("grade_distributions").select("semester").eq("match_key", key),
      svc.from("grade_reports").select("semester").eq("match_key", key),
    ]);
    const sems = new Set<string>();
    for (const r of gd.data ?? []) sems.add((r as { semester: string }).semester);
    for (const r of gr.data ?? []) sems.add((r as { semester: string }).semester);
    return NextResponse.json({ reviews: rv.count ?? 0, grades: sems.size });
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
    const svc = createServiceRoleClient();
    const [rv, gd, gr] = await Promise.all([
      pub.from("course_reviews").select("match_key, rating_overall").in("match_key", keys),
      pub.from("grade_distributions").select("match_key, semester").in("match_key", keys),
      svc.from("grade_reports").select("match_key, semester").in("match_key", keys),
    ]);
    type Count = { reviews: number; grades: number; rating: number | null };
    const counts: Record<string, Count> = {};
    const ratingSum: Record<string, number> = {}; // running rating sum → averaged
    const semsByKey: Record<string, Set<string>> = {}; // distinct grade semesters
    for (const k of keys) {
      counts[k] = { reviews: 0, grades: 0, rating: null };
      ratingSum[k] = 0;
      semsByKey[k] = new Set();
    }
    for (const r of rv.data ?? []) {
      const row = r as { match_key: string; rating_overall: number | null };
      const c = counts[row.match_key];
      if (c) {
        c.reviews++;
        ratingSum[row.match_key] += Number(row.rating_overall) || 0;
      }
    }
    // grades = distinct semesters across imported distributions + user reports.
    for (const g of [...(gd.data ?? []), ...(gr.data ?? [])]) {
      const row = g as { match_key: string; semester: string };
      semsByKey[row.match_key]?.add(row.semester);
    }
    for (const k of keys) {
      counts[k].grades = semsByKey[k].size;
      if (counts[k].reviews > 0) counts[k].rating = ratingSum[k] / counts[k].reviews;
    }
    return NextResponse.json({ counts });
  } catch (err) {
    console.error("[/api/course-info/counts POST] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

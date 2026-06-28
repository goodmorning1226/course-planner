// Minimal in-memory rate limiter for API routes.
//
// Good enough for a single-instance deployment and for local dev. For a
// horizontally-scaled production deployment, swap this for a shared store
// (e.g. Upstash Redis / Vercel KV / Cloudflare KV) keyed the same way — the
// call sites won't change. See README "Rate limiting".

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Per-endpoint limits (per client IP). */
export const RATE_LIMITS = {
  // Search: generous read endpoint.
  search: { limit: 90, windowMs: MINUTE },
  // Timetable read/write.
  timetableRead: { limit: 60, windowMs: MINUTE },
  timetableWrite: { limit: 60, windowMs: MINUTE },
  // Auth endpoints (if/when server routes exist).
  auth: { limit: 8, windowMs: MINUTE },
  // Scrape trigger: extremely low; admin-only.
  scrape: { limit: 3, windowMs: HOUR },
  // 修課情報: reviews/grades read + write.
  reviewRead: { limit: 90, windowMs: MINUTE },
  reviewWrite: { limit: 30, windowMs: MINUTE },
} as const;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed-window limiter.
 * @param key      Unique caller key (e.g. `courses:<ip>`).
 * @param limit    Max requests per window.
 * @param windowMs Window length in ms.
 */
export function rateLimit(
  key: string,
  limit = 60,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }

  bucket.count += 1;
  const ok = bucket.count <= limit;
  return { ok, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

/** Best-effort client IP from common proxy headers. */
export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}

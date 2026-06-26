import { NextResponse } from "next/server";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";
import { scrapeRequestSchema } from "@/lib/validations";

// POST /api/scrape — manual trigger for the low-frequency scraper.
//
// Hardened:
//  - Per-IP rate limit is EXTREMELY low (a few per hour) — applied BEFORE the
//    secret check so the shared secret cannot be brute-forced.
//  - Requires the SCRAPE_ADMIN_SECRET shared secret (x-scrape-secret header).
//    Normal users cannot trigger it.
//  - The actual scrape+upsert (service-role) runs server-side only, in
//    scripts/scrape-ntu-classrooms.ts from a trusted context.
//
// In production this endpoint is best NOT exposed publicly — prefer running the
// scraper as a scheduled job in a trusted environment. See README.
export async function POST(req: Request) {
  // Rate limit first (per IP), independent of whether the secret is correct.
  const rl = rateLimit(
    clientKey(req, "scrape"),
    RATE_LIMITS.scrape.limit,
    RATE_LIMITS.scrape.windowMs
  );
  if (!rl.ok) return rateLimited(rl.resetAt);

  const secret = process.env.SCRAPE_ADMIN_SECRET;
  const provided = req.headers.get("x-scrape-secret");
  if (!secret || provided !== secret) {
    return apiError("forbidden", "沒有權限。");
  }

  // Body is optional; validate it if present.
  const body = await req.json().catch(() => ({}));
  const parsed = scrapeRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return apiError("invalid_request", "請求內容不合法。");
  }

  // TODO: invoke the scrape routine (server-only, service-role). Kept
  // low-frequency so a user search never hits the NTU site directly.
  return NextResponse.json({ ok: true, note: "scrape trigger (not yet wired)" });
}

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { rateLimit, clientKey, RATE_LIMITS } from "@/lib/rate-limit";
import { apiError, rateLimited } from "@/lib/api-error";

// GET /api/courses/buildings — the distinct 開課地點 labels used by the filter
// chips. Sourced from scrape_buildings (its `label` equals courses.
// building_or_college). Read with the service-role client so the table stays
// RLS-private; only the label list is exposed. Heavily cacheable + low-churn.
export async function GET(req: Request) {
  const rl = rateLimit(
    clientKey(req, "buildings"),
    RATE_LIMITS.search.limit,
    RATE_LIMITS.search.windowMs
  );
  if (!rl.ok) return rateLimited(rl.resetAt);

  try {
    const svc = createServiceRoleClient();
    const { data, error } = await svc.from("scrape_buildings").select("label");
    if (error) throw error;

    const labels = Array.from(
      new Set(
        (data ?? [])
          .map((r) => (r as { label: string | null }).label)
          .filter((l): l is string => !!l && l.trim().length > 0)
      )
    );
    // 其他 (orphan bucket) always last; everything else by zh-Hant order.
    labels.sort((a, b) =>
      a === "其他" ? 1 : b === "其他" ? -1 : a.localeCompare(b, "zh-Hant")
    );

    return NextResponse.json(
      { buildings: labels },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err) {
    console.error("[/api/courses/buildings] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤，請稍後再試。");
  }
}

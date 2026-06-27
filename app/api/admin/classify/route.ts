import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";
import { manualClassifySchema } from "@/lib/validations";
import { deriveCourseType, GE_AREA_LABELS } from "@/lib/courses/classification";

// POST /api/admin/classify — an admin manually assigns categories to a course
// (to clear 未分類). Admin only. Marked source="manual"/confidence="high" so the
// enrich safeguard never overwrites it. Body: { courseId, categories[], geCategories[] }.
export async function POST(req: Request) {
  if (!(await getAdminUser())) return apiError("forbidden", "沒有權限。");

  const body = await req.json().catch(() => null);
  const parsed = manualClassifySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("invalid_request", parsed.error.issues[0]?.message ?? "請求不合法。");
  }
  const { courseId, categories, geCategories } = parsed.data;

  // Dedupe + drop 未分類 (assigning a real category clears it).
  const cats = [...new Set(categories)].filter((c) => c !== "uncategorized");
  if (cats.length === 0) return apiError("invalid_request", "至少選一個類別。");
  const ge = [...new Set(geCategories)].sort();

  try {
    const db = createServiceRoleClient();
    const { error } = await db
      .from("course_metadata")
      .update({
        categories: cats,
        course_type_normalized: deriveCourseType(cats, ge.length),
        is_general_education: ge.length > 0,
        ge_categories: ge,
        ge_labels: ge.map((c) => GE_AREA_LABELS[c]).filter(Boolean),
        ge_creditable: ge.length > 0 ? true : null,
        source: "manual",
        confidence: "high",
        matched_at: new Date().toISOString(),
      })
      .eq("course_id", courseId);
    if (error) throw error;

    return NextResponse.json({ ok: true, categories: cats, geCategories: ge });
  } catch (err) {
    console.error("[/api/admin/classify] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤。");
  }
}

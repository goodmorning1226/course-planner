import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

// GET /api/admin/changes?days=14 — course change log, grouped by day. Admin only.
// (This page will move to the public frontend later; admin-gated for now.)

interface ChangeRow {
  id: string;
  course_id: string | null;
  course_pk: string | null;
  course_name: string | null;
  building_or_college: string | null;
  change_type: string;
  detail: Record<string, unknown> | null;
  changed_on: string;
  created_at: string;
}

export async function GET(req: Request) {
  if (!(await getAdminUser())) return apiError("forbidden", "沒有權限。");

  const { searchParams } = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(searchParams.get("days") ?? 14) || 14));
  const since = new Date(Date.now() + 8 * 3600_000 - days * 86400_000)
    .toISOString()
    .slice(0, 10);

  const db = createServiceRoleClient();
  const { data, error } = await db
    .from("course_changes")
    .select("id, course_id, course_pk, course_name, building_or_college, change_type, detail, changed_on, created_at")
    .gte("changed_on", since)
    .order("changed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    console.error("[/api/admin/changes] failed:", error);
    return apiError("internal_error", "伺服器發生錯誤。");
  }

  // Group by day → by change_type summary + rows.
  const byDay = new Map<string, ChangeRow[]>();
  for (const r of (data ?? []) as ChangeRow[]) {
    const list = byDay.get(r.changed_on) ?? [];
    list.push(r);
    byDay.set(r.changed_on, list);
  }
  const groups = [...byDay.entries()].map(([day, rows]) => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.change_type] = (counts[r.change_type] ?? 0) + 1;
    return { day, counts, rows };
  });

  return NextResponse.json({ days, groups });
}

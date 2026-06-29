import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-error";

// GET /api/admin/contributions?days=30&kind=all|review|grade — audit log of
// review / grade-distribution adds, edits & deletes, with the actor's email.
export async function GET(req: Request) {
  if (!(await getAdminUser())) return apiError("forbidden", "沒有權限。");

  const { searchParams } = new URL(req.url);
  const days = Math.min(365, Math.max(1, Number(searchParams.get("days") ?? 30) || 30));
  const kind = searchParams.get("kind");
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  try {
    const db = createServiceRoleClient();
    let q = db
      .from("content_audit")
      .select("id, kind, action, course_name, teacher, semester, user_id, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (kind === "review" || kind === "grade") q = q.eq("kind", kind);
    const { data, error } = await q;
    if (error) throw error;

    // resolve user_id → email
    const emails = new Map<string, string>();
    try {
      const { data: u } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const usr of u?.users ?? []) emails.set(usr.id, usr.email ?? usr.id);
    } catch {
      /* fall back to raw ids */
    }
    const rows = (data ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      action: r.action,
      course_name: r.course_name,
      teacher: r.teacher,
      semester: r.semester,
      email: r.user_id ? emails.get(r.user_id as string) ?? (r.user_id as string) : "(unknown)",
      created_at: r.created_at,
    }));
    return NextResponse.json({ days, rows });
  } catch (err) {
    console.error("[/api/admin/contributions] failed:", err);
    return apiError("internal_error", "伺服器發生錯誤。");
  }
}

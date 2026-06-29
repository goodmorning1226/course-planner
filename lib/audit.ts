import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Best-effort audit log for user-generated content (reviews / grade
// distributions). Never throws — logging must not break the user's action.
export async function logContent(entry: {
  kind: "review" | "grade";
  action: "add" | "edit" | "delete";
  courseName?: string | null;
  teacher?: string | null;
  semester?: string | null;
  userId?: string | null;
  detail?: unknown;
}): Promise<void> {
  try {
    const db = createServiceRoleClient();
    await db.from("content_audit").insert({
      kind: entry.kind,
      action: entry.action,
      course_name: entry.courseName ?? null,
      teacher: entry.teacher ?? null,
      semester: entry.semester ?? null,
      user_id: entry.userId ?? null,
      detail: entry.detail ?? null,
    });
  } catch (err) {
    console.error("[audit] failed:", err);
  }
}

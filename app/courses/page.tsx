import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CoursesClient } from "@/components/courses/CoursesClient";

export const metadata = {
  title: "課程搜尋｜暫排課（非官方）",
};

export default async function CoursesPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <CoursesClient userEmail={user?.email ?? null} />;
}

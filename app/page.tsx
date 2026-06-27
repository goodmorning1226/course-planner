import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CoursesClient } from "@/components/courses/CoursesClient";

// Course search is the site's home page (served at "/").
export default async function HomePage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <CoursesClient userEmail={user?.email ?? null} />;
}

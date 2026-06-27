import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TimetableView } from "@/components/timetable/TimetableView";

export default async function TimetablePage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-1">
      <header className="text-center">
        <h1 className="text-xl font-semibold">我的課表</h1>
      </header>

      <TimetableView userEmail={user?.email ?? null} />
    </div>
  );
}

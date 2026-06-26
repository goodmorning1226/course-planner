import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TimetableView } from "@/components/timetable/TimetableView";

export const metadata = {
  title: "我的課表｜暫排課（非官方）",
};

export default async function TimetablePage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">我的課表</h1>
        <p className="text-sm text-muted-foreground">
          這裡顯示你加入的暫定課程。允許時段重疊，衝堂會清楚標示。
        </p>
        {/* Page-level disclaimer (required). */}
        <p className="text-xs text-muted-foreground/80">
          本課表僅根據非官方暫定資料產生，正式資訊請以臺大課程網為準。
        </p>
      </header>

      <TimetableView userEmail={user?.email ?? null} />
    </div>
  );
}

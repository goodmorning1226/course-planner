import { formatUpdatedAt } from "@/lib/utils";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Always-on, site-wide disclaimer (required). The "last updated" timestamp is
// the most recent courses.scraped_at (public-readable). scrape_runs is RLS-
// blocked for anon clients, so courses is the source here. Any failure falls
// back to "尚未取得" so the footer never breaks the page.
async function getLastUpdatedAt(): Promise<string | null> {
  try {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
      .from("courses")
      .select("scraped_at")
      .order("scraped_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.scraped_at ?? null;
  } catch {
    return null;
  }
}

export async function FooterNotice() {
  const lastUpdatedAt = await getLastUpdatedAt();

  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto w-full max-w-5xl px-4 py-4 text-center text-xs leading-relaxed text-muted-foreground">
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span>非官方暫定資料</span>
          <span aria-hidden>｜</span>
          <span>正式資訊以臺大課程網為準</span>
          <span aria-hidden>｜</span>
          <span>
            最後更新：
            {lastUpdatedAt ? formatUpdatedAt(lastUpdatedAt) : "尚未取得"}
          </span>
        </p>
        <p className="mt-1">
          本站與臺灣大學教務處、課程網無隸屬關係，資料整理自公開可查詢之教室課表，僅供參考。
        </p>
      </div>
    </footer>
  );
}

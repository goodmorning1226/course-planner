import { formatUpdatedAt } from "@/lib/utils";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unstable_noStore as noStore } from "next/cache";

// Always-on, site-wide disclaimer (required). The "last updated" timestamp is
// the most recent courses.scraped_at (public-readable). scrape_runs is RLS-
// blocked for anon clients, so courses is the source here. Any failure falls
// back to "尚未取得" so the footer never breaks the page.
async function getLastUpdatedAt(): Promise<string | null> {
  // Opt out of Next's Data Cache so the footer always reflects the latest
  // scrape — otherwise prod keeps serving the build-time value indefinitely.
  noStore();
  try {
    const supabase = createServerSupabaseClient();
    // Only courses actually pulled by the scraper carry a source_url — this
    // excludes manually-inserted rows (e.g. the test course) so 資料更新 always
    // reflects a real course re-scrape.
    const { data } = await supabase
      .from("courses")
      .select("scraped_at")
      .not("source_url", "is", null)
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
        {/* Stacked on mobile (no separator); inline with ｜ on sm+. */}
        <p className="flex flex-col items-center gap-y-0.5 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-2 sm:gap-y-1">
          <span>非台大官方網站，正式資訊以臺大課程網為準</span>
          <span aria-hidden className="hidden sm:inline">｜</span>
          <span>
            資料更新：
            {lastUpdatedAt ? formatUpdatedAt(lastUpdatedAt) : "尚未取得"}
          </span>
        </p>
        <p className="mt-2 sm:mt-1">
          本站與臺灣大學教務處、課程網無隸屬關係，資料整理自公開可查詢之教室課表，僅供參考。
        </p>
      </div>
    </footer>
  );
}

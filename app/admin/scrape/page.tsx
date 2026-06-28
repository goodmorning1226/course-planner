import Link from "next/link";
import { getAdminUser } from "@/lib/admin-server";
import { ScrapeSections } from "@/components/admin/ScrapeSections";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminScrapePage() {
  const admin = await getAdminUser();
  if (!admin) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-semibold">重新爬取</h1>
        <p className="text-sm text-muted-foreground">此頁僅限管理員。</p>
        <Link href="/login" className="text-sm font-medium underline">前往登入</Link>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin" className="underline">管理後台</Link>
          <span>/</span>
          <span>重新爬取</span>
        </div>
        <h1 className="text-xl font-semibold">分區重新爬取</h1>
        <p className="text-sm text-muted-foreground">
          可單獨重爬某個建物/學院、其他、或台科大；每區跑完即提交。亦可一鍵全爬。
        </p>
      </header>

      <details className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          ⓘ 線上（Vercel）按鈕無法直接爬取 — 請在本機執行
        </summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p>
            爬蟲需要無頭瀏覽器（Playwright/Chromium），serverless 環境跑不了。請在本機把
            <code className="mx-1 rounded bg-muted px-1">.env.local</code>
            指向正式 Supabase，再執行：
          </p>
          <pre className="overflow-x-auto rounded bg-background p-3 text-xs leading-relaxed">
{`# 全爬 + 分類
npm run scrape && npm run enrich

# 單區（值見下方各區，其他=%）
SCRAPE_ONLY=<value> SCRAPE_SECTION=<label> npm run scrape
ENRICH_BUILDING=<label> ENRICH_ONLY_NEW=1 npm run enrich

# 台科 校際
npm run interschool:fetch && npm run interschool:apply -- --apply`}
          </pre>
          <p>
            本機 <code className="mx-1 rounded bg-muted px-1">npm run dev</code>
            開的後台，下面的按鈕可直接運作；下方各區進度條讀的是正式 DB，跑完即會更新。
          </p>
        </div>
      </details>

      <ScrapeSections />
      <Link
        href="/admin/changes"
        className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted"
      >
        <div>
          <p className="text-sm font-semibold">課程變動日誌</p>
          <p className="text-xs text-muted-foreground">查看每次爬取的新增 / 停開 / 異動</p>
        </div>
        <span className="text-muted-foreground">→</span>
      </Link>
    </div>
  );
}

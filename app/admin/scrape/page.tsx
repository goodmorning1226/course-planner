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

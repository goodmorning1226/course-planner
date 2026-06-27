import Link from "next/link";
import { getAdminUser } from "@/lib/admin-server";
import { UncategorizedManager } from "@/components/admin/UncategorizedManager";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function UncategorizedPage() {
  const admin = await getAdminUser();

  if (!admin) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-semibold">未分類課程</h1>
        <p className="text-sm text-muted-foreground">此頁僅限管理員。請以管理員帳號登入。</p>
        <Link href="/login" className="text-sm font-medium text-foreground underline">
          前往登入
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
            ← 後台
          </Link>
        </div>
        <h1 className="text-xl font-semibold">未分類課程</h1>
        <p className="text-sm text-muted-foreground">
          搜尋未能自動分類的課程，手動標上正確類別（標記後不會被重新爬取覆蓋）。
        </p>
      </header>
      <UncategorizedManager />
    </div>
  );
}

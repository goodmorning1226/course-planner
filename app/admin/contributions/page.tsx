import Link from "next/link";
import { getAdminUser } from "@/lib/admin-server";
import { ContributionsLog } from "@/components/admin/ContributionsLog";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminContributionsPage() {
  const admin = await getAdminUser();
  if (!admin) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-semibold">評價／分布紀錄</h1>
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
          <span>評價／分布紀錄</span>
        </div>
        <h1 className="text-xl font-semibold">評價／分布紀錄</h1>
        <p className="text-sm text-muted-foreground">使用者新增／編輯／刪除課程評價與成績分布的歷史紀錄。</p>
      </header>
      <ContributionsLog />
    </div>
  );
}

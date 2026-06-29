import Link from "next/link";
import { getAdminUser } from "@/lib/admin-server";
import { DailyHistory } from "@/components/admin/DailyHistory";

export const metadata = { robots: { index: false, follow: false } };

export default async function AdminDailyPage() {
  const admin = await getAdminUser();
  if (!admin) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-semibold">每日歷史</h1>
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
          <span>每日歷史</span>
        </div>
        <h1 className="text-xl font-semibold">每日歷史</h1>
        <p className="text-sm text-muted-foreground">用 ← → 或日期選擇器，查看過去任一天的每小時使用者／瀏覽數／活躍人數。</p>
      </header>
      <DailyHistory />
    </div>
  );
}

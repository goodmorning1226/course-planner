import Link from "next/link";
import { getAdminUser } from "@/lib/admin-server";
import { ChangesLog } from "@/components/admin/ChangesLog";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminChangesPage() {
  const admin = await getAdminUser();
  if (!admin) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-semibold">課程變動日誌</h1>
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
          <span>課程變動日誌</span>
        </div>
        <h1 className="text-xl font-semibold">課程變動日誌</h1>
        <p className="text-sm text-muted-foreground">
          每次爬取偵測到的課程變動（新增 / 停開 / 復開 / 異動），依日期呈現。日後將開放前台。
        </p>
      </header>
      <ChangesLog />
    </div>
  );
}

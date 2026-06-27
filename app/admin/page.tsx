import Link from "next/link";
import { getAdminUser } from "@/lib/admin-server";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const admin = await getAdminUser();

  if (!admin) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-semibold">管理後台</h1>
        <p className="text-sm text-muted-foreground">
          此頁僅限管理員。請以管理員帳號登入。
        </p>
        <Link href="/login" className="text-sm font-medium text-foreground underline">
          前往登入
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">管理後台</h1>
        <p className="text-sm text-muted-foreground">
          {admin.email}｜資料指標與一鍵重新爬取
        </p>
      </header>
      <AdminDashboard />
    </div>
  );
}

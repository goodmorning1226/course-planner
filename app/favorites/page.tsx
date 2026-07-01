import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { FavoritesClient } from "@/components/courses/FavoritesClient";

export const metadata = { title: "收藏課程" };

export default async function FavoritesPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-semibold">收藏課程</h1>
        <p className="text-sm text-muted-foreground">請先登入以查看你收藏的課程。</p>
        <Link href="/login" className="text-sm font-medium underline">前往登入</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">收藏課程</h1>
      </header>
      <FavoritesClient userEmail={user.email ?? ""} />
    </div>
  );
}

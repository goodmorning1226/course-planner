import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MyReviews } from "@/components/reviews/MyReviews";

export const metadata = { title: "我的評論" };

export default async function MyReviewsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-semibold">我的評論</h1>
        <p className="text-sm text-muted-foreground">請先登入以查看你的課程評價。</p>
        <Link href="/login" className="text-sm font-medium underline">前往登入</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">我的評論</h1>
      </header>
      <MyReviews />
    </div>
  );
}

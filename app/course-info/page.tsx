import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CourseInfo } from "@/components/courses/CourseInfo";

export const metadata = { title: "修課情報" };

export default async function CourseInfoPage({
  searchParams,
}: {
  searchParams: { name?: string; teacher?: string; tab?: string; editGrade?: string };
}) {
  const name = (searchParams.name ?? "").trim();
  const teacher = (searchParams.teacher ?? "").trim() || null;
  const initialTab = searchParams.tab === "grades" ? "grades" : "reviews";
  const editGrade = (searchParams.editGrade ?? "").trim() || undefined;

  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!name) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-16 text-center">
        <h1 className="text-xl font-semibold">修課情報</h1>
        <p className="text-sm text-muted-foreground">缺少課程資訊。</p>
        <Link href="/" className="text-sm font-medium underline">回課程搜尋</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <Link href="/" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ← 課程搜尋
        </Link>
        <h1 className="text-xl font-semibold">
          修課情報 · {name}
          {teacher && <span className="ml-1 text-base font-normal text-muted-foreground">（{teacher}）</span>}
        </h1>
      </header>
      <CourseInfo
        courseName={name}
        teacher={teacher}
        loggedIn={!!user}
        initialTab={initialTab}
        initialGradeSemester={editGrade}
      />
    </div>
  );
}

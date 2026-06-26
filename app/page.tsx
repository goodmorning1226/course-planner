import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="space-y-10 py-6">
      <section className="space-y-4">
        <p className="inline-flex rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground">
          非官方 · 臺大 115-1
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          在正式課程網公告前，先排好你的暫定課表
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          這是一個<strong className="font-medium text-foreground">非官方</strong>
          暫排課工具，資料整理自公開可查詢之臺大 115-1
          教室課表。你可以提前搜尋課程、加入暫排課表、卡好時段。資料為暫定且可能異動，正式課程資訊請以臺大課程網公告為準。
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/courses">
            <Button>開始搜尋課程</Button>
          </Link>
          <Link href="/timetable">
            <Button variant="outline">查看我的課表</Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { title: "搜尋課程", body: "依課名、教師、教室、流水號搜尋，並用星期、節次、建物等條件篩選。" },
          { title: "排暫定課表", body: "一鍵加入課表，桌機用週課表格、手機用清單檢視，衝堂會清楚標示。" },
          { title: "跨裝置同步", body: "未登入存在本機；登入後同步到雲端，並可把本機課表合併上去。" },
        ].map((f) => (
          <Card key={f.title} className="p-4">
            <h2 className="text-sm font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {f.body}
            </p>
          </Card>
        ))}
      </section>
    </div>
  );
}

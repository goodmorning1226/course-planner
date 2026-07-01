"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import type { MyGradeReport } from "@/app/api/grade-reports/me/route";

// The user's own 成績分布 reports (成績回報) — listed on /my-reviews' 成績分布 tab.
// Editing a report happens on the course's 修課情報 page (the report form lives
// there); here we surface each report + a 刪除 action.
export function MyGradeReports() {
  const [reports, setReports] = useState<MyGradeReport[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MyGradeReport | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/grade-reports/me");
      const j = await r.json();
      setReports(j.reports ?? []);
    } catch {
      setReports([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteErr(null);
    setDeleteBusy(true);
    try {
      const r = await fetch("/api/grade-reports", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseName: deleteTarget.course_name,
          teacher: deleteTarget.teacher,
          semester: deleteTarget.semester,
        }),
      });
      if (!r.ok) throw new Error();
      setDeleteTarget(null);
      setDeleteBusy(false);
      load();
    } catch {
      setDeleteErr("刪除失敗，請稍後再試。");
      setDeleteBusy(false);
    }
  }

  if (reports === null) return <p className="text-sm text-muted-foreground">載入中…</p>;
  if (reports.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        <p>你還沒有回報任何成績分布。</p>
        <Link href="/" className="mt-2 inline-block font-medium text-foreground underline">前往課程搜尋</Link>
      </div>
    );

  const pct = (v: number | null) => (v != null ? `${v}%` : "—");

  return (
    <>
      <ul className="space-y-3">
        {reports.map((rp) => {
          const infoHref =
            `/course-info?name=${encodeURIComponent(rp.course_name)}` +
            (rp.teacher ? `&teacher=${encodeURIComponent(rp.teacher)}` : "");
          // 「編輯」導到修課情報的成績分布頁，並自動展開這學期的回報表單。
          const editHref = `${infoHref}&tab=grades&editGrade=${encodeURIComponent(rp.semester)}`;
          return (
            <li key={rp.id}>
              <Card className="p-4">
                {/* 左邊資訊整欄；按鈕靠右並對齊底部（右下角）。 */}
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium">{rp.course_name}</span>
                      {rp.teacher && <span className="text-xs text-muted-foreground">{rp.teacher}</span>}
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{rp.semester}</span>
                      <span className="rounded bg-foreground px-1.5 py-0.5 text-xs text-background">
                        {rp.pivot}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>比我低 {pct(rp.below_pct)}</span>
                      <span>與我相同 {pct(rp.same_pct)}</span>
                      <span>比我高 {pct(rp.above_pct)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={infoHref}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      修課情報
                    </Link>
                    <Link
                      href={editHref}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      編輯
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteTarget(rp)}
                      className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      刪除
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <Modal
        open={deleteTarget !== null}
        onClose={() => { if (!deleteBusy) setDeleteTarget(null); }}
        title="刪除成績回報"
        className="max-w-sm"
      >
        <p className="text-sm text-muted-foreground">
          確定要刪除「{deleteTarget?.course_name}」{deleteTarget?.semester} 的成績回報嗎？此動作無法復原。
        </p>
        {deleteErr && <p className="mt-2 text-sm text-red-600">{deleteErr}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteBusy}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={confirmDelete}
            disabled={deleteBusy}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {deleteBusy ? "刪除中…" : "刪除"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

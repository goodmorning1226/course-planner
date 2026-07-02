"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { StarRating, StarRatingInput } from "@/components/ui/StarRating";
import { ThumbsUpIcon } from "@/components/icons/ThumbsUpIcon";
import type { CourseReview } from "@/lib/courses/types";

const AXES = [
  { key: "rating_overall", label: "整體" },
  { key: "rating_sweet", label: "甜度" },
  { key: "rating_chill", label: "涼度" },
] as const;

export function MyReviews() {
  const [reviews, setReviews] = useState<CourseReview[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // 刪除確認彈窗：deleteTarget 為待刪除的評價（null 時關閉）。
  const [deleteTarget, setDeleteTarget] = useState<CourseReview | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/reviews/me");
      const j = await r.json();
      setReviews(j.reviews ?? []);
    } catch {
      setReviews([]);
    }
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteErr(null);
    setDeleteBusy(true);
    try {
      const r = await fetch("/api/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: deleteTarget.id }),
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

  useEffect(() => {
    load();
  }, [load]);

  if (reviews === null) return <p className="text-sm text-muted-foreground">載入中…</p>;
  if (reviews.length === 0)
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        <p>你還沒有留下任何評價。</p>
        <Link href="/" className="mt-2 inline-block font-medium text-foreground underline">前往課程搜尋</Link>
      </div>
    );

  return (
    <>
      <ul className="space-y-3">
      {reviews.map((rv) =>
        editing === rv.id ? (
          <EditRow key={rv.id} review={rv} onDone={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />
        ) : (
          <li key={rv.id}>
            <Card className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium">{rv.course_name}</span>
                {rv.teacher && <span className="text-xs text-muted-foreground">{rv.teacher}</span>}
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{rv.semester}</span>
                {/* 讚數釘在標題行右上角 */}
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <ThumbsUpIcon filled className="h-3.5 w-3.5" /> {rv.like_count}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {AXES.map((a) => (
                  <span key={a.key} className="inline-flex items-center gap-1">
                    {a.label}{" "}
                    {rv[a.key] == null ? <span>—</span> : <StarRating value={rv[a.key] as number} size={13} />}
                  </span>
                ))}
              </div>
              {rv.comment && <p className="whitespace-pre-wrap text-sm">{rv.comment}</p>}
              <div className="flex justify-end gap-2">
                <Link
                  href={`/course-info?name=${encodeURIComponent(rv.course_name)}${rv.teacher ? `&teacher=${encodeURIComponent(rv.teacher)}` : ""}&from=my-reviews`}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-transparent px-3 text-sm font-medium transition-colors hover:bg-muted"
                >
                  修課情報
                </Link>
                <Button size="sm" variant="outline" onClick={() => setEditing(rv.id)}>編輯</Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDeleteTarget(rv)}
                  className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  刪除
                </Button>
              </div>
            </Card>
          </li>
        )
      )}
      </ul>

      <Modal
        open={deleteTarget !== null}
        onClose={() => { if (!deleteBusy) setDeleteTarget(null); }}
        title="刪除評價"
        className="max-w-sm"
      >
        <p className="text-sm text-muted-foreground">
          確定要刪除「{deleteTarget?.course_name}」的評價嗎？此動作無法復原。
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

function EditRow({ review, onDone, onCancel }: { review: CourseReview; onDone: () => void; onCancel: () => void }) {
  const [ratings, setRatings] = useState({
    overall: review.rating_overall, sweet: review.rating_sweet ?? 0, chill: review.rating_chill ?? 0,
  });
  const [comment, setComment] = useState(review.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 扎實 已從介面移除，但後端仍要求 solid；沿用總體評分填入以符合驗證。
        // 甜度／涼度為選填，未給分（0）時送 null。
        body: JSON.stringify({
          courseName: review.course_name,
          teacher: review.teacher,
          semester: review.semester,
          overall: ratings.overall,
          sweet: ratings.sweet >= 0.5 ? ratings.sweet : null,
          chill: ratings.chill >= 0.5 ? ratings.chill : null,
          solid: ratings.overall,
          comment,
        }),
      });
      if (!r.ok) throw new Error();
      onDone();
    } catch {
      setErr("儲存失敗。");
      setBusy(false);
    }
  }

  const INPUTS = [
    { key: "overall", label: "整體" }, { key: "sweet", label: "甜度" },
    { key: "chill", label: "涼度" },
  ] as const;

  return (
    <li>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{review.course_name}</span>
          {review.teacher && <span className="text-xs text-muted-foreground">{review.teacher}</span>}
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{review.semester}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {INPUTS.map((a) => (
            <div key={a.key} className="space-y-1">
              <p className="text-xs text-muted-foreground">{a.label}</p>
              <StarRatingInput value={ratings[a.key]} onChange={(v) => setRatings((r) => ({ ...r, [a.key]: v }))} size={22} />
            </div>
          ))}
        </div>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="修課心得（選填）" />
        {err && <p className="text-sm text-[hsl(var(--warning))]">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>取消</Button>
          <Button size="sm" onClick={save} disabled={busy}>儲存</Button>
        </div>
      </Card>
    </li>
  );
}

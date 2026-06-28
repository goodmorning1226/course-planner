"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/Textarea";
import { StarRating, StarRatingInput } from "@/components/ui/StarRating";
import type { CourseReview } from "@/lib/courses/types";

const AXES = [
  { key: "rating_overall", label: "總體" },
  { key: "rating_sweet", label: "甜度" },
  { key: "rating_chill", label: "涼度" },
  { key: "rating_solid", label: "扎實" },
] as const;

export function MyReviews() {
  const [reviews, setReviews] = useState<CourseReview[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/reviews/me");
      const j = await r.json();
      setReviews(j.reviews ?? []);
    } catch {
      setReviews([]);
    }
  }, []);

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
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {AXES.map((a) => (
                  <span key={a.key} className="inline-flex items-center gap-1">
                    {a.label} <StarRating value={rv[a.key] as number} size={13} />
                  </span>
                ))}
                <span>👍 {rv.like_count}</span>
              </div>
              {rv.comment && <p className="whitespace-pre-wrap text-sm">{rv.comment}</p>}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(rv.id)}>編輯</Button>
              </div>
            </Card>
          </li>
        )
      )}
    </ul>
  );
}

function EditRow({ review, onDone, onCancel }: { review: CourseReview; onDone: () => void; onCancel: () => void }) {
  const [ratings, setRatings] = useState({
    overall: review.rating_overall, sweet: review.rating_sweet, chill: review.rating_chill, solid: review.rating_solid,
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
        body: JSON.stringify({ courseName: review.course_name, teacher: review.teacher, semester: review.semester, ...ratings, comment }),
      });
      if (!r.ok) throw new Error();
      onDone();
    } catch {
      setErr("儲存失敗。");
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("確定要刪除這則評價嗎？")) return;
    setBusy(true);
    try {
      const r = await fetch("/api/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: review.id }),
      });
      if (!r.ok) throw new Error();
      onDone();
    } catch {
      setErr("刪除失敗。");
      setBusy(false);
    }
  }

  const INPUTS = [
    { key: "overall", label: "總體" }, { key: "sweet", label: "甜度" },
    { key: "chill", label: "涼度" }, { key: "solid", label: "扎實" },
  ] as const;

  return (
    <li>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{review.course_name}</span>
          {review.teacher && <span className="text-xs text-muted-foreground">{review.teacher}</span>}
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{review.semester}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {INPUTS.map((a) => (
            <div key={a.key} className="space-y-1">
              <p className="text-xs text-muted-foreground">{a.label}</p>
              <StarRatingInput value={ratings[a.key]} onChange={(v) => setRatings((r) => ({ ...r, [a.key]: v }))} size={22} />
            </div>
          ))}
        </div>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="修課心得（選填）" />
        {err && <p className="text-sm text-[hsl(var(--warning))]">{err}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={busy}>儲存</Button>
          <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>取消</Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy} className="text-red-600">刪除</Button>
        </div>
      </Card>
    </li>
  );
}

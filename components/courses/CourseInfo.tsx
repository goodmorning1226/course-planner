"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { StarRating, StarRatingInput } from "@/components/ui/StarRating";
import { SEMESTER_OPTIONS } from "@/lib/reviews/key";
import { GradeReports } from "@/components/courses/GradeReports";
import type { CourseReview, ReviewAggregate } from "@/lib/courses/types";

// 修課情報 page content: 課程評價 + 成績分布 for a course identity (name+teacher).
// Public can browse; logged-in users write. (Rendered by /course-info, not a modal.)

const AXES = [
  { key: "overall", label: "整體" },
  { key: "sweet", label: "甜度" },
  { key: "chill", label: "涼度" },
] as const;
type AxisKey = (typeof AXES)[number]["key"];

// 各頁籤的新增／編輯表單開關（null = 關閉；物件 = 開啟，可帶預設學期）。
type FormState = { initial?: string } | null;

function qs(name: string, teacher: string | null) {
  const p = new URLSearchParams({ name });
  if (teacher) p.set("teacher", teacher);
  return p.toString();
}

export function CourseInfo({
  courseName,
  teacher,
  loggedIn,
  initialTab = "reviews",
  initialGradeSemester,
}: {
  courseName: string;
  teacher: string | null;
  loggedIn: boolean;
  // 由 /my-reviews 的「編輯」帶入：直接開在成績分布頁、並展開該學期的回報表單。
  initialTab?: "reviews" | "grades";
  initialGradeSemester?: string;
}) {
  const [tab, setTab] = useState<"reviews" | "grades">(initialTab);
  // Per-tab counts for the labels. Seeded by one counts request, then kept in
  // sync by each tab as it loads / mutates its own data.
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [gradeCount, setGradeCount] = useState<number | null>(null);
  // 表單開關狀態上移到這裡，讓觸發按鈕能放到頁籤列右上角、與頁籤同一行。
  const [reviewForm, setReviewForm] = useState<FormState>(null);
  const [gradeForm, setGradeForm] = useState<FormState>(
    initialGradeSemester ? { initial: initialGradeSemester } : null,
  );

  useEffect(() => {
    let active = true;
    fetch(`/api/course-info/counts?${qs(courseName, teacher)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!active || !j) return;
        setReviewCount(j.reviews ?? 0);
        setGradeCount(j.grades ?? 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [courseName, teacher]);

  const tabs = [
    { k: "reviews", main: "課程評價", count: reviewCount != null ? `（${reviewCount} 則評價）` : "" },
    { k: "grades", main: "成績分布", count: gradeCount != null ? `（${gradeCount} 個學期）` : "" },
  ] as const;

  return (
    <div className="space-y-4">
      {/* 手機版：頁籤一列、按鈕另起一列並置中；電腦版：同一列、按鈕靠右。 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center justify-center gap-3 sm:justify-start">
          {tabs.map(({ k, main, count }) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={
                "rounded-md px-3 py-1.5 text-center text-sm transition-colors " +
                (tab === k ? "bg-foreground text-background" : "bg-muted hover:opacity-80")
              }
            >
              {/* 每段各自不換行；空間不足時整段「（幾則）」落到第二行，不會從中間斷字。 */}
              <span className="whitespace-nowrap">{main}</span>
              {count && (
                <>
                  <wbr />
                  <span className="whitespace-nowrap">{count}</span>
                </>
              )}
            </button>
          ))}
        </div>
        {/* 新增評論／回報成績按鈕：表單開啟時隱藏。 */}
        {loggedIn &&
          (tab === "reviews"
            ? !reviewForm && (
                <Button size="sm" variant="outline" className="self-end sm:ml-auto sm:self-auto" onClick={() => setReviewForm({})}>
                  新增／編輯評論
                </Button>
              )
            : !gradeForm && (
                <Button size="sm" variant="outline" className="self-end sm:ml-auto sm:self-auto" onClick={() => setGradeForm({})}>
                  回報 / 更新成績
                </Button>
              ))}
      </div>
      {tab === "reviews" ? (
        <ReviewsTab courseName={courseName} teacher={teacher} loggedIn={loggedIn} onCount={setReviewCount} form={reviewForm} setForm={setReviewForm} />
      ) : (
        <GradeReports courseName={courseName} teacher={teacher} loggedIn={loggedIn} onCount={setGradeCount} form={gradeForm} setForm={setGradeForm} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 課程評價
// ---------------------------------------------------------------------------
function ReviewsTab({ courseName, teacher, loggedIn, onCount, form, setForm }: { courseName: string; teacher: string | null; loggedIn: boolean; onCount: (n: number) => void; form: FormState; setForm: Dispatch<SetStateAction<FormState>> }) {
  const [aggregate, setAggregate] = useState<ReviewAggregate | null>(null);
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/reviews?${qs(courseName, teacher)}`);
      const j = await r.json();
      setAggregate(j.aggregate ?? null);
      setReviews(j.reviews ?? []);
      onCount(j.aggregate?.count ?? j.reviews?.length ?? 0);
    } catch {
      setNotice("載入評價失敗。");
    } finally {
      setLoading(false);
    }
  }, [courseName, teacher, onCount]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleLike(rv: CourseReview) {
    if (!loggedIn) return setNotice("登入後才能按讚。");
    const method = rv.liked ? "DELETE" : "POST";
    setReviews((prev) => prev.map((x) => (x.id === rv.id ? { ...x, liked: !x.liked, like_count: x.like_count + (rv.liked ? -1 : 1) } : x)));
    try {
      const r = await fetch(`/api/reviews/${rv.id}/like`, { method });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setReviews((prev) => prev.map((x) => (x.id === rv.id ? { ...x, liked: j.liked, like_count: j.like_count } : x)));
    } catch {
      load();
    }
  }

  async function report(rv: CourseReview) {
    if (!loggedIn) return setNotice("登入後才能檢舉。");
    if (!window.confirm("確定要檢舉這則評論嗎？")) return;
    try {
      await fetch(`/api/reviews/${rv.id}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setNotice("已送出檢舉，感謝回報。");
    } catch {
      setNotice("檢舉失敗。");
    }
  }

  return (
    <div className="space-y-4">
      {/* 觸發按鈕在 CourseInfo 頁籤列；表單面板／未登入提示放最上面，評分總覽移到其下。 */}
      {loggedIn && form && (
        <ReviewForm
          courseName={courseName}
          teacher={teacher}
          reviews={reviews}
          initialSemester={form.initial}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); load(); }}
        />
      )}
      {!loggedIn && (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground underline">登入</Link> 後即可留下評價、按讚與檢舉。
        </p>
      )}

      {aggregate && aggregate.count > 0 ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border p-3">
          {AXES.map((a) => {
            const v = aggregate[a.key as keyof ReviewAggregate] as number | null;
            return (
              <div key={a.key} className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">{a.label}</span>
                <StarRating value={v ?? 0} size={16} />
                <span className="tabular-nums">{v != null ? v.toFixed(1) : "—"}</span>
              </div>
            );
          })}
          <span className="ml-auto text-xs text-muted-foreground">共 {aggregate.count} 則</span>
        </div>
      ) : (
        !loading && <p className="text-sm text-muted-foreground">還沒有評價，成為第一個評價的人吧。</p>
      )}

      {notice && <p className="text-sm text-[hsl(var(--warning))]">{notice}</p>}

      {loading && <p className="text-sm text-muted-foreground">載入中…</p>}

      {!loading && (
        <ul className="space-y-3">
          {reviews.map((rv) => (
            <li key={rv.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{rv.semester}</span>
                  {rv.mine && <span className="rounded bg-foreground px-1.5 py-0.5 text-xs text-background">我的</span>}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    整體 <StarRating value={rv.rating_overall} size={14} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    甜 {rv.rating_sweet ?? "—"} · 涼 {rv.rating_chill ?? "—"}
                  </span>
                </div>
                {/* 讚放到右上角；自己的留言時放在鉛筆左邊，別人的留言就單獨靠右上。 */}
                <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => toggleLike(rv)}
                    aria-label="按讚"
                    className={"inline-flex items-center gap-1 transition-colors hover:text-foreground " + (rv.liked ? "text-foreground" : "")}
                  >
                    <ThumbsUpIcon filled={rv.liked} className="h-4 w-4" /> {rv.like_count}
                  </button>
                  {rv.mine && (
                    <button
                      type="button"
                      onClick={() => setForm({ initial: rv.semester })}
                      aria-label="編輯評論"
                      title="編輯"
                      className="rounded p-1 transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              {rv.comment && <p className="mt-2 whitespace-pre-wrap text-sm">{rv.comment}</p>}
              {!rv.mine && (
                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                  <button type="button" onClick={() => report(rv)} className="transition-colors hover:text-foreground">
                    檢舉
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const emptyRatings = (): Record<AxisKey, number> => ({ overall: 0, sweet: 0, chill: 0 });
const fillRatings = (r?: CourseReview): Record<AxisKey, number> =>
  r ? { overall: r.rating_overall, sweet: r.rating_sweet ?? 0, chill: r.rating_chill ?? 0 } : emptyRatings();
const defaultReviewSemester = (mineBySem: Map<string, CourseReview>) =>
  // 一人一課只留一則：已評過就預設載入該學期（編輯它），否則用最新學期。
  [...mineBySem.keys()][0] ?? SEMESTER_OPTIONS[0];

// One form for add + edit. Pick any semester: one you've already reviewed loads
// its values for editing; a new one starts blank. Either way submits via upsert.
function ReviewForm({
  courseName,
  teacher,
  reviews,
  initialSemester,
  onClose,
  onSaved,
}: {
  courseName: string;
  teacher: string | null;
  reviews: CourseReview[];
  initialSemester?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mineBySem = useMemo(
    () => new Map(reviews.filter((r) => r.mine).map((r) => [r.semester, r])),
    [reviews]
  );
  const [semester, setSemester] = useState(initialSemester ?? defaultReviewSemester(mineBySem));
  const [ratings, setRatings] = useState<Record<AxisKey, number>>(() => fillRatings(mineBySem.get(semester)));
  const [comment, setComment] = useState(mineBySem.get(semester)?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Switching semester loads that semester's own review (or blanks).
  useEffect(() => {
    const mine = mineBySem.get(semester);
    setRatings(fillRatings(mine));
    setComment(mine?.comment ?? "");
  }, [semester, mineBySem]);

  const editing = mineBySem.has(semester);
  // 只有「整體」為必填；甜度／涼度選填（未給分時送 null，不列入平均）。
  const ready = ratings.overall >= 0.5;

  async function submit() {
    setErr(null);
    if (!ready) return setErr("請至少給「整體」評分（至少半顆星）。");
    setSaving(true);
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 扎實 已從介面移除，但後端仍要求 solid；沿用整體評分填入以符合驗證。
        // 甜度／涼度未評分（0）時送 null，代表「未填」。
        body: JSON.stringify({
          courseName,
          teacher,
          semester,
          overall: ratings.overall,
          sweet: ratings.sweet >= 0.5 ? ratings.sweet : null,
          chill: ratings.chill >= 0.5 ? ratings.chill : null,
          solid: ratings.overall,
          comment,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error?.message ?? "儲存失敗");
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const mine = mineBySem.get(semester);
    if (!mine) return;
    if (!window.confirm("確定要刪除這則評論嗎？")) return;
    setSaving(true);
    try {
      const r = await fetch("/api/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: mine.id }),
      });
      if (!r.ok) throw new Error();
      onSaved();
    } catch {
      setErr("刪除失敗。");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={editing ? "編輯評論" : "新增評論"}>
      <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">修課學期</span>
        <Select value={semester} onChange={(e) => setSemester(e.target.value)}>
          {SEMESTER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
              {mineBySem.has(s) ? "（已評）" : ""}
            </option>
          ))}
        </Select>
        {editing && <span className="text-xs text-muted-foreground">編輯既有</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {AXES.map((a) => (
          <div key={a.key} className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {a.label}
              {a.key === "overall" ? (
                <span className="text-[hsl(var(--warning))]"> *</span>
              ) : (
                <span className="text-muted-foreground/60">（選填）</span>
              )}
            </p>
            <StarRatingInput value={ratings[a.key]} onChange={(v) => setRatings((r) => ({ ...r, [a.key]: v }))} size={24} />
          </div>
        ))}
      </div>
      <Textarea placeholder="留下你的修課心得（選填）" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {err && <p className="w-full text-sm text-[hsl(var(--warning))]">{err}</p>}
        {editing && (
          <Button
            size="sm"
            variant="outline"
            onClick={remove}
            disabled={saving}
            className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            刪除
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
        <Button size="sm" onClick={submit} disabled={saving || !semester}>
          {saving ? "儲存中…" : editing ? "更新" : "送出"}
        </Button>
      </div>
      </div>
    </Modal>
  );
}

// --- icons -------------------------------------------------------------------
function ThumbsUpIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 0 1 6 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V3a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23h-.777ZM2.331 10.977a11.969 11.969 0 0 0-.831 4.398 12 12 0 0 0 .52 3.507c.26.85 1.084 1.368 1.973 1.368H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 0 1-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V3a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904M14.25 9h2.252M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
    </svg>
  );
}

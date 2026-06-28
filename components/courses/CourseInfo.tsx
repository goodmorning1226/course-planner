"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/input";
import { StarRating, StarRatingInput } from "@/components/ui/StarRating";
import { SEMESTER_OPTIONS } from "@/lib/reviews/key";
import { GRADE_BUCKETS } from "@/lib/courses/types";
import type { CourseReview, ReviewAggregate, GradeDistribution } from "@/lib/courses/types";

// 修課情報 page content: 課程評價 + 成績分布 for a course identity (name+teacher).
// Public can browse; logged-in users write. (Rendered by /course-info, not a modal.)

const AXES = [
  { key: "overall", label: "總體" },
  { key: "sweet", label: "甜度" },
  { key: "chill", label: "涼度" },
  { key: "solid", label: "扎實" },
] as const;
type AxisKey = (typeof AXES)[number]["key"];

function qs(name: string, teacher: string | null) {
  const p = new URLSearchParams({ name });
  if (teacher) p.set("teacher", teacher);
  return p.toString();
}

export function CourseInfo({
  courseName,
  teacher,
  loggedIn,
}: {
  courseName: string;
  teacher: string | null;
  loggedIn: boolean;
}) {
  const [tab, setTab] = useState<"reviews" | "grades">("reviews");
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {([["reviews", "課程評價"], ["grades", "成績分布"]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={
              "rounded-md px-3 py-1.5 text-sm transition-colors " +
              (tab === k ? "bg-foreground text-background" : "bg-muted hover:opacity-80")
            }
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "reviews" ? (
        <ReviewsTab courseName={courseName} teacher={teacher} loggedIn={loggedIn} />
      ) : (
        <GradesTab courseName={courseName} teacher={teacher} loggedIn={loggedIn} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 課程評價
// ---------------------------------------------------------------------------
function ReviewsTab({ courseName, teacher, loggedIn }: { courseName: string; teacher: string | null; loggedIn: boolean }) {
  const [aggregate, setAggregate] = useState<ReviewAggregate | null>(null);
  const [reviews, setReviews] = useState<CourseReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  // null = no form; otherwise add a new review or edit an existing one.
  const [form, setForm] = useState<{ mode: "add" } | { mode: "edit"; review: CourseReview } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/reviews?${qs(courseName, teacher)}`);
      const j = await r.json();
      setAggregate(j.aggregate ?? null);
      setReviews(j.reviews ?? []);
    } catch {
      setNotice("載入評價失敗。");
    } finally {
      setLoading(false);
    }
  }, [courseName, teacher]);

  useEffect(() => {
    load();
  }, [load]);

  // Semesters the user hasn't reviewed yet (for the 新增評論 picker).
  const reviewedSemesters = useMemo(() => new Set(reviews.filter((r) => r.mine).map((r) => r.semester)), [reviews]);
  const available = useMemo(() => SEMESTER_OPTIONS.filter((s) => !reviewedSemesters.has(s)), [reviewedSemesters]);

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
          <span className="text-xs text-muted-foreground">· {aggregate.count} 則</span>
        </div>
      ) : (
        !loading && <p className="text-sm text-muted-foreground">還沒有評價，成為第一個評價的人吧。</p>
      )}

      {notice && <p className="text-sm text-[hsl(var(--warning))]">{notice}</p>}

      {loading && <p className="text-sm text-muted-foreground">載入中…</p>}

      {/* 新增評論 按鈕（左上）/ 表單 */}
      {loggedIn ? (
        form ? (
          <ReviewForm
            courseName={courseName}
            teacher={teacher}
            mode={form.mode}
            review={form.mode === "edit" ? form.review : undefined}
            available={available}
            onClose={() => setForm(null)}
            onSaved={() => { setForm(null); load(); }}
          />
        ) : available.length > 0 ? (
          <Button size="sm" variant="outline" onClick={() => setForm({ mode: "add" })}>
            ＋ 新增評論
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">你已評價過所有可選學期。</p>
        )
      ) : (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground underline">登入</Link> 後即可留下評價、按讚與檢舉。
        </p>
      )}

      {!loading && (
        <ul className="space-y-3">
          {reviews.map((rv) => (
            <li key={rv.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{rv.semester}</span>
                  {rv.mine && <span className="rounded bg-foreground px-1.5 py-0.5 text-xs text-background">我的</span>}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    總體 <StarRating value={rv.rating_overall} size={14} />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    甜 {rv.rating_sweet} · 涼 {rv.rating_chill} · 扎 {rv.rating_solid}
                  </span>
                </div>
                {rv.mine && (
                  <button
                    type="button"
                    onClick={() => setForm({ mode: "edit", review: rv })}
                    aria-label="編輯評論"
                    title="編輯"
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              {rv.comment && <p className="mt-2 whitespace-pre-wrap text-sm">{rv.comment}</p>}
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => toggleLike(rv)}
                  aria-label="按讚"
                  className={"inline-flex items-center gap-1 transition-colors hover:text-foreground " + (rv.liked ? "text-foreground" : "")}
                >
                  <ThumbsUpIcon filled={rv.liked} className="h-4 w-4" /> {rv.like_count}
                </button>
                {!rv.mine && (
                  <button type="button" onClick={() => report(rv)} className="transition-colors hover:text-foreground">
                    檢舉
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewForm({
  courseName,
  teacher,
  mode,
  review,
  available,
  onClose,
  onSaved,
}: {
  courseName: string;
  teacher: string | null;
  mode: "add" | "edit";
  review?: CourseReview;
  available: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = mode === "edit" && !!review;
  const [semester, setSemester] = useState(isEdit ? review!.semester : available[0] ?? "");
  const [ratings, setRatings] = useState<Record<AxisKey, number>>(
    isEdit
      ? { overall: review!.rating_overall, sweet: review!.rating_sweet, chill: review!.rating_chill, solid: review!.rating_solid }
      : { overall: 0, sweet: 0, chill: 0, solid: 0 }
  );
  const [comment, setComment] = useState(isEdit ? review!.comment ?? "" : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = AXES.every((a) => ratings[a.key] >= 0.5);

  async function submit() {
    setErr(null);
    if (!ready) return setErr("四個項目都要給星等（至少半顆）。");
    setSaving(true);
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseName, teacher, semester, ...ratings, comment }),
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
    if (!review) return;
    if (!window.confirm("確定要刪除這則評論嗎？")) return;
    setSaving(true);
    try {
      const r = await fetch("/api/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: review.id }),
      });
      if (!r.ok) throw new Error();
      onSaved();
    } catch {
      setErr("刪除失敗。");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{isEdit ? "編輯評論" : "新增評論"}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          title="關閉"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">修課學期</span>
        {isEdit ? (
          <span className="rounded bg-muted px-2 py-1 text-xs">{semester}</span>
        ) : (
          <Select value={semester} onChange={(e) => setSemester(e.target.value)}>
            {available.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {AXES.map((a) => (
          <div key={a.key} className="space-y-1">
            <p className="text-xs text-muted-foreground">{a.label}</p>
            <StarRatingInput value={ratings[a.key]} onChange={(v) => setRatings((r) => ({ ...r, [a.key]: v }))} size={24} />
          </div>
        ))}
      </div>
      <Textarea placeholder="留下你的修課心得（選填）" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
      {err && <p className="text-sm text-[hsl(var(--warning))]">{err}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={saving || !semester}>
          {saving ? "儲存中…" : isEdit ? "更新評論" : "送出評論"}
        </Button>
        <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>取消</Button>
        {isEdit && (
          <Button size="sm" variant="ghost" onClick={remove} disabled={saving} className="ml-auto text-red-600">
            刪除
          </Button>
        )}
      </div>
    </div>
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

// ---------------------------------------------------------------------------
// 成績分布
// ---------------------------------------------------------------------------
function GradesTab({ courseName, teacher, loggedIn }: { courseName: string; teacher: string | null; loggedIn: boolean }) {
  const [dists, setDists] = useState<GradeDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/grades?${qs(courseName, teacher)}`);
      const j = await r.json();
      setDists(j.distributions ?? []);
    } finally {
      setLoading(false);
    }
  }, [courseName, teacher]);

  useEffect(() => {
    load();
  }, [load]);

  // 已存在的學期不可再新增（避免覆蓋）。
  const existingSemesters = useMemo(() => new Set(dists.map((d) => d.semester)), [dists]);
  const available = useMemo(() => SEMESTER_OPTIONS.filter((s) => !existingSemesters.has(s)), [existingSemesters]);

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-muted-foreground">載入中…</p>
      ) : dists.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚無成績分布資料。</p>
      ) : (
        <div className="space-y-4">
          {dists.map((d) => (
            <div key={d.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{d.semester}</span>
                {d.note && <span className="text-xs text-muted-foreground">{d.note}</span>}
              </div>
              <div className="space-y-1">
                {GRADE_BUCKETS.map((b) => {
                  const v = d[b.key] as number | null;
                  return (
                    <div key={b.key as string} className="flex items-center gap-2 text-xs">
                      <span className="w-7 shrink-0 text-right tabular-nums text-muted-foreground">{b.label}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div className="h-full rounded-sm bg-foreground/70" style={{ width: `${Math.min(100, v ?? 0)}%` }} />
                      </div>
                      <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{v != null ? `${v}%` : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {loggedIn ? (
        showForm ? (
          <GradeForm courseName={courseName} teacher={teacher} available={available} onSaved={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
        ) : available.length > 0 ? (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>＋ 新增成績分布</Button>
        ) : (
          !loading && <p className="text-xs text-muted-foreground">所有學期皆已有成績分布。</p>
        )
      ) : (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground underline">登入</Link> 後即可新增成績分布。
        </p>
      )}
    </div>
  );
}

function GradeForm({ courseName, teacher, available, onSaved, onCancel }: { courseName: string; teacher: string | null; available: string[]; onSaved: () => void; onCancel: () => void }) {
  const [semester, setSemester] = useState(available[0] ?? "");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fieldMap: Record<string, string> = {
    a_plus: "aPlus", a: "a", a_minus: "aMinus", b_plus: "bPlus", b: "b", b_minus: "bMinus",
    c_plus: "cPlus", c: "c", c_minus: "cMinus", f: "f",
  };

  async function submit() {
    setErr(null);
    setSaving(true);
    const buckets: Record<string, number | null> = {};
    for (const b of GRADE_BUCKETS) {
      const raw = vals[b.key as string];
      const n = raw != null && raw !== "" ? Number(raw) : null;
      if (n != null && (Number.isNaN(n) || n < 0 || n > 100)) {
        setSaving(false);
        return setErr(`${b.label} 需為 0–100 的百分比。`);
      }
      buckets[fieldMap[b.key as string]] = n;
    }
    try {
      const r = await fetch("/api/grades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseName, teacher, semester, ...buckets, note }),
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

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">學期</span>
        <Select value={semester} onChange={(e) => setSemester(e.target.value)}>
          {available.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
        <span className="text-xs text-muted-foreground">各級距填百分比（可留空）</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {GRADE_BUCKETS.map((b) => (
          <label key={b.key as string} className="flex items-center gap-1 text-xs">
            <span className="w-7 shrink-0 text-muted-foreground">{b.label}</span>
            <Input
              type="number" min={0} max={100} step="0.01" inputMode="decimal" placeholder="%"
              value={vals[b.key as string] ?? ""}
              onChange={(e) => setVals((v) => ({ ...v, [b.key as string]: e.target.value }))}
              className="h-8"
            />
          </label>
        ))}
      </div>
      <Input placeholder="備註（選填）" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      {err && <p className="text-sm text-[hsl(var(--warning))]">{err}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={saving || !semester}>{saving ? "儲存中…" : "送出"}</Button>
        <Button size="sm" variant="outline" onClick={onCancel}>取消</Button>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CourseWithSessionsAndMetadata } from "@/lib/courses/types";
import { CourseCard } from "./CourseCard";
import { useTimetableSelection } from "@/lib/timetable/useTimetableSelection";
import { matchKey } from "@/lib/reviews/key";

type InfoCount = { reviews: number; grades: number };

// The 收藏課程 page body. Loads the user's favorited courses and renders them as
// the same CourseCard used in search, so they can be added to the timetable,
// viewed (修課情報, when enabled), or un-favorited (which removes the card).
export function FavoritesClient({ userEmail }: { userEmail: string }) {
  const [courses, setCourses] = useState<CourseWithSessionsAndMetadata[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 修課情報 counts keyed by course identity (match_key), so the cards show the
  // same 修課情報（總數）as in search.
  const [infoCounts, setInfoCounts] = useState<Record<string, InfoCount>>({});
  const selection = useTimetableSelection(userEmail);

  useEffect(() => {
    let active = true;
    fetch("/api/favorites")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (active) setCourses(json.courses ?? []);
      })
      .catch(() => {
        if (active) {
          setCourses([]);
          setError("載入收藏失敗，請重新整理。");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Fetch 修課情報 counts for any favorited course we don't have a count for yet
  // (in batches of 60, the endpoint's cap). Removals don't refetch.
  useEffect(() => {
    if (!courses || courses.length === 0) return;
    const pending = new Map<string, { name: string; teacher: string | null }>();
    for (const c of courses) {
      const key = matchKey(c.course_name, c.teacher ?? null);
      if (!(key in infoCounts) && !pending.has(key)) {
        pending.set(key, { name: c.course_name, teacher: c.teacher ?? null });
      }
    }
    if (pending.size === 0) return;
    const list = [...pending.values()];
    const ctrl = new AbortController();
    (async () => {
      const acc: Record<string, InfoCount> = {};
      for (let i = 0; i < list.length; i += 60) {
        try {
          const r = await fetch("/api/course-info/counts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pairs: list.slice(i, i + 60) }),
            signal: ctrl.signal,
          });
          if (!r.ok) continue;
          const j = await r.json();
          if (j?.counts) Object.assign(acc, j.counts);
        } catch {
          /* counts are best-effort */
        }
      }
      if (!ctrl.signal.aborted && Object.keys(acc).length) {
        setInfoCounts((prev) => ({ ...prev, ...acc }));
      }
    })();
    return () => ctrl.abort();
  }, [courses, infoCounts]);

  // Un-favorite: drop the card immediately; restore it on failure.
  const removeFavorite = useCallback(
    async (course: CourseWithSessionsAndMetadata) => {
      setError(null);
      setCourses((prev) => prev?.filter((c) => c.id !== course.id) ?? prev);
      try {
        const res = await fetch("/api/favorites", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: course.id }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setCourses((prev) => (prev ? [course, ...prev] : prev));
        setError("取消收藏失敗，請稍後再試。");
      }
    },
    []
  );

  if (courses === null) {
    return <p className="py-16 text-center text-sm text-muted-foreground">載入中…</p>;
  }

  return (
    <div className="space-y-3">
      {(error || selection.error) && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5 px-3 py-2 text-sm text-[hsl(var(--warning))]">
          <span>{error ?? selection.error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              selection.clearError();
            }}
            className="shrink-0 text-xs underline-offset-2 hover:underline"
          >
            關閉
          </button>
        </div>
      )}

      {courses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <p className="text-foreground">還沒有收藏任何課程</p>
          <p className="mt-1 text-xs">
            在
            <Link href="/" className="mx-1 font-medium text-foreground underline">
              課程搜尋
            </Link>
            點課程旁的旗幟即可收藏。
          </p>
        </div>
      ) : (
        courses.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            isSelected={selection.isSelected(course.id)}
            onToggle={selection.toggle}
            infoCount={infoCounts[matchKey(course.course_name, course.teacher ?? null)]}
            isFavorited
            onToggleFavorite={removeFavorite}
          />
        ))
      )}
    </div>
  );
}

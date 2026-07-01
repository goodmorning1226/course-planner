"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CourseWithSessionsAndMetadata } from "@/lib/courses/types";
import type { SearchFilters } from "./CourseFilters";
import { CourseCard } from "./CourseCard";
import { Button } from "@/components/ui/button";
import { saveSearchSnapshot, type CourseListInitial } from "@/lib/courses/searchState";
import { matchKey } from "@/lib/reviews/key";

type InfoCount = { reviews: number; grades: number; rating?: number | null };

// Fetches /api/courses with cursor pagination and renders results with infinite
// scroll (IntersectionObserver sentinel — no traditional pager). Handles
// loading / loading-more / empty / error / no-more states.

type Status = "loading" | "loadingMore" | "ready" | "error";

interface ApiResponse {
  data: CourseWithSessionsAndMetadata[];
  nextCursor: string | null;
  total: number | null;
}

function buildUrl(q: string, filters: SearchFilters, cursor: string | null) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (filters.weekday?.length) p.set("weekday", filters.weekday.join(","));
  if (filters.period?.length) p.set("period", filters.period.join(","));
  if (filters.courseType) p.set("courseType", filters.courseType);
  if (filters.depts?.length) p.set("dept", filters.depts.join(","));
  if (filters.deptGrade) p.set("deptGrade", filters.deptGrade);
  if (filters.isGeneralEducation) p.set("isGeneralEducation", filters.isGeneralEducation);
  if (filters.geCategory?.length) p.set("geCategory", filters.geCategory.join(","));
  if (cursor) p.set("cursor", cursor);
  p.set("limit", "30");
  return `/api/courses?${p.toString()}`;
}

export function CourseList({
  q,
  filters,
  isSelected,
  onToggle,
  onTotal,
  initialData,
  isFavorited,
  onToggleFavorite,
}: {
  q: string;
  filters: SearchFilters;
  isSelected: (id: string) => boolean;
  onToggle: (course: CourseWithSessionsAndMetadata) => void;
  onTotal?: (total: number | null) => void;
  initialData?: CourseListInitial | null;
  isFavorited?: (id: string) => boolean;
  onToggleFavorite?: (course: CourseWithSessionsAndMetadata) => void;
}) {
  // Hydrate from a restored snapshot (Back from 修課情報) when present.
  const [items, setItems] = useState<CourseWithSessionsAndMetadata[]>(initialData?.items ?? []);
  const [cursor, setCursor] = useState<string | null>(initialData?.cursor ?? null);
  const [hasMore, setHasMore] = useState(initialData ? initialData.hasMore : true);
  const [status, setStatus] = useState<Status>(initialData ? "ready" : "loading");
  const [retryNonce, setRetryNonce] = useState(0);

  // 修課情報 counts (reviews + grades) keyed by course identity (match_key),
  // fetched in batch per page so the cards don't each fire their own request.
  const [infoCounts, setInfoCounts] = useState<Record<string, InfoCount>>({});

  // Bumped on every new search; in-flight responses with a stale id are ignored.
  const reqId = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const skipInitial = useRef(!!initialData); // restored → don't refetch page 1
  const totalRef = useRef<number | null>(initialData?.total ?? null);

  // Page 1 whenever the query or filters change (skipped once on Back-restore).
  useEffect(() => {
    if (skipInitial.current) {
      skipInitial.current = false;
      const y = initialData?.scrollY ?? 0;
      // two frames so the restored list has laid out before we scroll.
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
      return;
    }
    const id = ++reqId.current;
    const ctrl = new AbortController();
    setStatus("loading");
    fetch(buildUrl(q, filters, null), { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => {
        if (id !== reqId.current) return;
        setItems(json.data ?? []);
        setCursor(json.nextCursor ?? null);
        setHasMore(Boolean(json.nextCursor));
        setStatus("ready");
        totalRef.current = json.total ?? null;
        onTotal?.(json.total ?? null);
      })
      .catch((err) => {
        if (ctrl.signal.aborted || id !== reqId.current) return;
        console.error("[CourseList] load failed:", err);
        setStatus("error");
        onTotal?.(null);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filters, retryNonce]);

  // Persist the whole search state on unmount (navigating to 修課情報) so Back
  // restores query/filters/results/scroll. Refs hold the latest values.
  const snapRef = useRef({ items, cursor, hasMore, q, filters });
  snapRef.current = { items, cursor, hasMore, q, filters };
  useEffect(
    () => () => {
      const s = snapRef.current;
      saveSearchSnapshot({
        q: s.q,
        filters: s.filters,
        items: s.items,
        cursor: s.cursor,
        hasMore: s.hasMore,
        total: totalRef.current,
        scrollY: window.scrollY,
      });
    },
    []
  );

  // Fetch 修課情報 counts for any newly-shown courses (covers first page,
  // load-more, and Back-restore). Keyed by match_key so duplicates dedupe.
  useEffect(() => {
    const pending = new Map<string, { name: string; teacher: string | null }>();
    for (const c of items) {
      const key = matchKey(c.course_name, c.teacher ?? null);
      if (!(key in infoCounts) && !pending.has(key)) {
        pending.set(key, { name: c.course_name, teacher: c.teacher ?? null });
      }
    }
    if (pending.size === 0) return;
    const ctrl = new AbortController();
    fetch("/api/course-info/counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairs: [...pending.values()].slice(0, 60) }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.counts) setInfoCounts((prev) => ({ ...prev, ...j.counts }));
      })
      .catch(() => {
        /* counts are best-effort; ignore */
      });
    return () => ctrl.abort();
  }, [items, infoCounts]);

  const loadMore = useCallback(() => {
    if (!cursor) return;
    const id = reqId.current; // same search session
    setStatus("loadingMore");
    fetch(buildUrl(q, filters, cursor))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => {
        if (id !== reqId.current) return; // a new search superseded this
        setItems((prev) => [...prev, ...(json.data ?? [])]);
        setCursor(json.nextCursor ?? null);
        setHasMore(Boolean(json.nextCursor));
        setStatus("ready");
      })
      .catch((err) => {
        if (id !== reqId.current) return;
        console.error("[CourseList] load more failed:", err);
        setStatus("error");
      });
  }, [q, filters, cursor]);

  // Infinite-scroll sentinel.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && status === "ready") {
          loadMore();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, hasMore, status]);

  // --- States ---------------------------------------------------------------

  if (status === "loading") {
    return <SkeletonList />;
  }

  if (status === "error" && items.length === 0) {
    return (
      <Notice>
        <p>載入失敗，請稍後再試。</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => setRetryNonce((n) => n + 1)}
        >
          重試
        </Button>
      </Notice>
    );
  }

  if (items.length === 0) {
    return (
      <Notice>
        <p className="text-foreground">找不到符合條件的課程</p>
        <p className="mt-1 text-xs">
          試著調整關鍵字，或放寬星期、節次、教室等篩選條件。
        </p>
      </Notice>
    );
  }

  return (
    <div className="space-y-3" aria-busy={status === "loadingMore"}>
      {items.map((course) => (
        <CourseCard
          key={course.id}
          course={course}
          isSelected={isSelected(course.id)}
          onToggle={onToggle}
          infoCount={infoCounts[matchKey(course.course_name, course.teacher ?? null)]}
          isFavorited={isFavorited?.(course.id)}
          onToggleFavorite={onToggleFavorite}
        />
      ))}

      {status === "loadingMore" && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          載入更多…
        </p>
      )}

      {status === "error" && items.length > 0 && (
        <div className="py-4 text-center">
          <Button size="sm" variant="outline" onClick={loadMore}>
            載入更多失敗，重試
          </Button>
        </div>
      )}

      {!hasMore && status !== "loadingMore" && (
        <p className="py-4 text-center text-xs text-muted-foreground">
          已顯示所有符合條件的課程
        </p>
      )}

      {/* Sentinel: observed to trigger the next page. */}
      <div ref={sentinelRef} aria-hidden className="h-px" />
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-lg border border-border bg-muted/40"
        />
      ))}
    </div>
  );
}

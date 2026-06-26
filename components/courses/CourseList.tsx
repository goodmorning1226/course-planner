"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CourseWithSessions } from "@/lib/courses/types";
import type { SearchFilters } from "./CourseFilters";
import { CourseCard } from "./CourseCard";
import { Button } from "@/components/ui/button";

// Fetches /api/courses with cursor pagination and renders results with infinite
// scroll (IntersectionObserver sentinel — no traditional pager). Handles
// loading / loading-more / empty / error / no-more states.

type Status = "loading" | "loadingMore" | "ready" | "error";

interface ApiResponse {
  data: CourseWithSessions[];
  nextCursor: string | null;
}

function buildUrl(q: string, filters: SearchFilters, cursor: string | null) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (filters.weekday?.length) p.set("weekday", filters.weekday.join(","));
  if (filters.period?.length) p.set("period", filters.period.join(","));
  if (filters.buildingOrCollege?.length)
    p.set("buildingOrCollege", filters.buildingOrCollege.join(","));
  if (filters.teacher) p.set("teacher", filters.teacher);
  if (cursor) p.set("cursor", cursor);
  p.set("limit", "30");
  return `/api/courses?${p.toString()}`;
}

export function CourseList({
  q,
  filters,
  isSelected,
  onToggle,
}: {
  q: string;
  filters: SearchFilters;
  isSelected: (id: string) => boolean;
  onToggle: (course: CourseWithSessions) => void;
}) {
  const [items, setItems] = useState<CourseWithSessions[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [status, setStatus] = useState<Status>("loading");
  const [retryNonce, setRetryNonce] = useState(0);

  // Bumped on every new search; in-flight responses with a stale id are ignored.
  const reqId = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Page 1 whenever the query or filters change.
  useEffect(() => {
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
      })
      .catch((err) => {
        if (ctrl.signal.aborted || id !== reqId.current) return;
        console.error("[CourseList] load failed:", err);
        setStatus("error");
      });
    return () => ctrl.abort();
  }, [q, filters, retryNonce]);

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

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CourseSearchBar } from "@/components/courses/CourseSearchBar";
import {
  CourseFilters,
  type SearchFilters,
} from "@/components/courses/CourseFilters";
import { CourseList } from "@/components/courses/CourseList";
import { DeptPicker } from "@/components/courses/DeptPicker";
import { COURSE_CATEGORIES, GE_AREA_LABELS } from "@/lib/courses/classification";
import { useTimetableSelection } from "@/lib/timetable/useTimetableSelection";
import { cn } from "@/lib/utils";

// Interactive body of the search page. Auth state arrives from the server
// component so we know up front whether to use localStorage or the cloud.
// Navbar height (h-14 = 56px); the search header pins directly below it.
const NAV_H = 56;

export function CoursesClient({ userEmail }: { userEmail: string | null }) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({});
  const selection = useTimetableSelection(userEmail);

  // The sticky search header grows when a category sub-row (系所/通識) opens, so
  // we measure it and pin the filter column exactly below it (no magic offset).
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerH, setHeaderH] = useState(0);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight));
    ro.observe(el);
    setHeaderH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  return (
    // -mt-6 cancels <main>'s top padding so the sticky header's natural position
    // is already flush under the navbar — it pins with ZERO travel instead of
    // sliding up as you scroll. The navbar↔title gap is recreated INSIDE the
    // header (pt-8) so it stays put and never scrolls away.
    <div className="-mt-6 space-y-4">
      {/* Pinned below the navbar (h-14): title + 我的課表 link + search bar stay
          put while the course list scrolls underneath. -mx-4 makes the solid
          background span the full content width so cards don't show through. */}
      <div
        ref={headerRef}
        className="sticky top-14 z-20 -mx-4 space-y-3 border-b border-border bg-background px-4 pb-3 pt-8"
      >
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">課程搜尋</h1>
          {selection.ready && selection.count > 0 && (
            <Link
              href="/timetable"
              className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              我的課表（{selection.count}）
            </Link>
          )}
        </div>
        <CourseSearchBar onSearch={setQ} />

        {/* 課程大類 — single-select row directly under the search bar.
            「全部」清掉大類篩選 → 顯示所有課程。 */}
        <div className="flex gap-1 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={() =>
              setFilters((f) => {
                const next = { ...f };
                delete next.courseType;
                delete next.geCategory;
                delete next.depts;
                delete next.deptGrade;
                return next;
              })
            }
            className={cn(
              "shrink-0 whitespace-nowrap rounded-sm border px-2.5 py-1 text-xs transition-colors",
              !filters.courseType
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            全部
          </button>
          {COURSE_CATEGORIES.map((o) => {
            const active = filters.courseType === o.slug;
            return (
              <button
                key={o.slug}
                type="button"
                onClick={() =>
                  setFilters((f) => {
                    const next = { ...f };
                    if (f.courseType === o.slug) delete next.courseType;
                    else next.courseType = o.slug;
                    // 通識領域 only applies under 通識; 系所/年級 only under 系所.
                    if (next.courseType !== "general") delete next.geCategory;
                    if (next.courseType !== "dept") {
                      delete next.depts;
                      delete next.deptGrade;
                    }
                    return next;
                  })
                }
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-sm border px-2.5 py-1 text-xs transition-colors",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>

        {/* 通識領域 sub-row — only when 通識 is the active 大類. A1–A8 + 未確定
            (通識課但找不到歷史資料、無法判定領域者). */}
        {filters.courseType === "general" && (
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {[...Object.keys(GE_AREA_LABELS), "未確定"].map((area) => {
              const active = filters.geCategory === area;
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() =>
                    setFilters((f) => {
                      const next = { ...f };
                      if (f.geCategory === area) delete next.geCategory;
                      else next.geCategory = area;
                      return next;
                    })
                  }
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-sm border px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {GE_AREA_LABELS[area] ? `${area} ${GE_AREA_LABELS[area]}` : area}
                </button>
              );
            })}
          </div>
        )}

        {/* 系所 大類 — searchable multi-select departments + per-dept 年級. */}
        {filters.courseType === "dept" && (
          <DeptPicker
            depts={filters.depts ?? []}
            deptGrade={filters.deptGrade}
            onChange={({ depts, deptGrade }) =>
              setFilters((f) => {
                const next = { ...f };
                if (depts.length) next.depts = depts;
                else delete next.depts;
                if (deptGrade) next.deptGrade = deptGrade;
                else delete next.deptGrade;
                return next;
              })
            }
          />
        )}
      </div>

      {selection.error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5 px-3 py-2 text-sm text-[hsl(var(--warning))]">
          <span>{selection.error}</span>
          <button
            type="button"
            onClick={selection.clearError}
            className="shrink-0 text-xs underline-offset-2 hover:underline"
          >
            關閉
          </button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside
          className="md:sticky md:self-start"
          // Pin at exactly the filter's resting position — navbar + header +
          // the space-y-4 gap (16px) above the grid — so it sticks with ZERO
          // travel, matching the search header (no slide before it sticks).
          style={{ top: NAV_H + headerH + 16 }}
        >
          <CourseFilters value={filters} onChange={setFilters} />
        </aside>
        <section>
          <CourseList
            q={q}
            filters={filters}
            isSelected={selection.isSelected}
            onToggle={selection.toggle}
          />
        </section>
      </div>
    </div>
  );
}

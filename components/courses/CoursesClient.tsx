"use client";

import { useEffect, useRef, useState } from "react";
import { CourseSearchBar } from "@/components/courses/CourseSearchBar";
import {
  CourseFilters,
  type SearchFilters,
} from "@/components/courses/CourseFilters";
import { CourseList } from "@/components/courses/CourseList";
import { DeptPicker } from "@/components/courses/DeptPicker";
import { COURSE_CATEGORIES, GE_AREA_LABELS } from "@/lib/courses/classification";
import { useTimetableSelection } from "@/lib/timetable/useTimetableSelection";
import { useFavorites } from "@/lib/courses/useFavorites";
import { loadSearchSnapshot, type CourseListInitial } from "@/lib/courses/searchState";
import { cn } from "@/lib/utils";

// Interactive body of the search page. Auth state arrives from the server
// component so we know up front whether to use localStorage or the cloud.
export function CoursesClient({ userEmail }: { userEmail: string | null }) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({});
  const [total, setTotal] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const initialList = useRef<CourseListInitial | null>(null);
  const selection = useTimetableSelection(userEmail);
  const favorites = useFavorites(userEmail);

  // Restore the previous search (query/filters/results/scroll) on first mount,
  // so Back from a course's 修課情報 lands exactly where the user left off.
  useEffect(() => {
    const snap = loadSearchSnapshot();
    if (snap) {
      setQ(snap.q ?? "");
      setFilters(snap.filters ?? {});
      setTotal(snap.total ?? null);
      initialList.current = {
        items: snap.items,
        cursor: snap.cursor,
        hasMore: snap.hasMore,
        total: snap.total,
        scrollY: snap.scrollY,
      };
    }
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return <div className="py-16 text-center text-sm text-muted-foreground">載入中…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Search header — scrolls with the page (no longer pinned). */}
      <div className="space-y-3 border-b border-border pb-3">
        <header className="text-center">
          <h1 className="text-xl font-semibold">課程搜尋</h1>
        </header>
        <CourseSearchBar onSearch={setQ} initialValue={q} />
        <p className="text-xs text-muted-foreground">
          共 {total == null ? "—" : total.toLocaleString()} 筆結果
        </p>

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

        {/* 通識領域 sub-row — only when 通識 is the active 大類. A1–A8 (multi). */}
        {filters.courseType === "general" && (
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {Object.keys(GE_AREA_LABELS).map((area) => {
              const active = !!filters.geCategory?.includes(area);
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() =>
                    setFilters((f) => {
                      const cur = f.geCategory ?? [];
                      const list = cur.includes(area)
                        ? cur.filter((a) => a !== area)
                        : [...cur, area];
                      const next = { ...f };
                      if (list.length) next.geCategory = list;
                      else delete next.geCategory;
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

      {favorites.error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5 px-3 py-2 text-sm text-[hsl(var(--warning))]">
          <span>{favorites.error}</span>
          <button
            type="button"
            onClick={favorites.clearError}
            className="shrink-0 text-xs underline-offset-2 hover:underline"
          >
            關閉
          </button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside>
          <CourseFilters value={filters} onChange={setFilters} />
        </aside>
        <section>
          <CourseList
            q={q}
            filters={filters}
            isSelected={selection.isSelected}
            onToggle={selection.toggle}
            onTotal={setTotal}
            initialData={initialList.current}
            isFavorited={favorites.isFavorited}
            onToggleFavorite={favorites.toggle}
            selectionReady={selection.ready}
            selectedIds={selection.ids}
          />
        </section>
      </div>
    </div>
  );
}

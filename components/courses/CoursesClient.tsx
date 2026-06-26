"use client";

import { useState } from "react";
import Link from "next/link";
import { CourseSearchBar } from "@/components/courses/CourseSearchBar";
import {
  CourseFilters,
  type SearchFilters,
} from "@/components/courses/CourseFilters";
import { CourseList } from "@/components/courses/CourseList";
import { useTimetableSelection } from "@/lib/timetable/useTimetableSelection";

// Interactive body of the search page. Auth state arrives from the server
// component so we know up front whether to use localStorage or the cloud.
export function CoursesClient({ userEmail }: { userEmail: string | null }) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<SearchFilters>({});
  const selection = useTimetableSelection(userEmail);

  return (
    <div className="space-y-4">
      {/* Pinned below the navbar (h-14): title + 我的課表 link + search bar stay
          put while the course list scrolls underneath. -mx-4 makes the solid
          background span the full content width so cards don't show through. */}
      <div className="sticky top-14 z-20 -mx-4 space-y-3 border-b border-border bg-background px-4 pb-3 pt-2">
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
      </div>

      <p className="text-sm text-muted-foreground">
        搜尋臺大 115-1
        教室課表中已出現的課程。資料為非官方暫定、可能異動，僅供提前安排參考。
      </p>

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
        <aside className="md:sticky md:top-44 md:self-start">
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

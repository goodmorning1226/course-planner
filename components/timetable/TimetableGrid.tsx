"use client";

import { useEffect, useState } from "react";
import type { CourseWithSessions, Weekday } from "@/lib/courses/types";
import { PERIOD_CODES, getPeriodTime } from "@/lib/courses/periods";
import { buildSlotIndex, cellKey } from "@/lib/courses/conflicts";
import { formatPeriods } from "@/lib/courses/periods";
import { weekdayLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/ui/StarRating";
import { matchKey } from "@/lib/reviews/key";

type InfoCount = { reviews: number; grades: number; rating?: number | null };

// Desktop weekly grid: columns = Mon–Sun, rows = periods 0–10, A–D.
// A course occupies every (weekday, period) cell it meets in. Courses sharing a
// slot are simply shown as separate boxes (no conflict highlight). Clicking a
// course selects THAT course — all of its cells are highlighted and a detail
// panel below shows only that course's info.

// Mon–Sat. Sunday (7) is dropped — no course is ever scheduled on Sundays.
const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6];
// 晚上時段 (evening periods) A–D — hidden by the 隱藏晚上 switch.
const EVENING_CODES = new Set(["A", "B", "C", "D"]);

export function TimetableGrid({
  courses,
  onRemove,
  hideEvening = false,
}: {
  courses: CourseWithSessions[];
  onRemove: (courseId: string) => void;
  hideEvening?: boolean;
}) {
  const slots = buildSlotIndex(courses);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Hovering any cell of a course highlights ALL of its cells (CSS :hover only
  // covers the single hovered cell, so we track it ourselves).
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const periods = hideEvening
    ? PERIOD_CODES.filter((p) => !EVENING_CODES.has(p))
    : PERIOD_CODES;

  // 修課情報 counts (reviews + grades) + 總體評分, keyed by match_key. Fetched
  // for every course in the table so the selected-course detail can show them.
  const [infoCounts, setInfoCounts] = useState<Record<string, InfoCount>>({});
  useEffect(() => {
    const pending = new Map<string, { name: string; teacher: string | null }>();
    for (const c of courses) {
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
  }, [courses, infoCounts]);

  const selectedCourse = selectedId
    ? courses.find((c) => c.id === selectedId) ?? null
    : null;
  const selectedInfo = selectedCourse
    ? infoCounts[matchKey(selectedCourse.course_name, selectedCourse.teacher ?? null)]
    : undefined;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-xs">
          <thead>
            <tr className="bg-muted/40">
              <th className="sticky left-0 z-20 w-16 border-b border-border bg-muted p-2 font-bold text-muted-foreground">
                節次
              </th>
              {DAYS.map((d) => (
                <th
                  key={d}
                  className="border-b border-l border-border p-2 font-bold text-muted-foreground"
                >
                  {weekdayLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period}>
                <td className="sticky left-0 z-10 border-b border-border bg-background p-1 text-center text-muted-foreground">
                  <div className="font-bold">{period}</div>
                  {(() => {
                    const t = getPeriodTime(period);
                    return t ? (
                      <div className="text-[9px] leading-tight tabular-nums">
                        {t.start}
                        <br />
                        {t.end}
                      </div>
                    ) : null;
                  })()}
                </td>
                {DAYS.map((day) => {
                  const cell = slots.get(cellKey(day, period)) ?? [];
                  return (
                    <td
                      key={day}
                      className="border-b border-l border-border p-1 align-top"
                    >
                      {cell.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {cell.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() =>
                                setSelectedId((prev) =>
                                  prev === c.id ? null : c.id
                                )
                              }
                              onMouseEnter={() => setHoveredId(c.id)}
                              onMouseLeave={() => setHoveredId(null)}
                              title={c.status === "removed" ? `${c.course_name}（已停開）` : c.course_name}
                              className={cn(
                                "w-full rounded-sm p-1 text-left transition-colors",
                                c.id === hoveredId
                                  ? "bg-foreground/20 text-foreground"
                                  : "bg-muted",
                                c.id === selectedId && "ring-2 ring-foreground/40",
                                c.status === "removed" && "text-muted-foreground line-through opacity-70"
                              )}
                            >
                              <span className="block truncate font-sans text-[11px]">
                                {c.course_name}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail for the clicked course (only that course, all its sessions). */}
      {selectedCourse && (
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              {/* 標題行：課名 + 總體評分 + 班次。課名完整顯示，過長時整行換行（不截斷）。 */}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold">
                <span>{selectedCourse.course_name}</span>
                {/* 總體評分 stars (only when there are reviews) */}
                {selectedInfo?.rating != null && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1"
                    title={`整體評分 ${selectedInfo.rating.toFixed(1)}`}
                  >
                    <StarRating value={selectedInfo.rating} size={14} />
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                      {selectedInfo.rating.toFixed(1)}
                    </span>
                  </span>
                )}
                {selectedCourse.status === "removed" && (
                  <span className="shrink-0 rounded-sm bg-[hsl(var(--warning))]/15 px-1.5 py-0.5 text-[11px] font-medium text-[hsl(var(--warning))]">
                    已停開
                  </span>
                )}
                {selectedCourse.class_group && (
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">
                    班次 {selectedCourse.class_group}
                  </span>
                )}
              </p>
              {/* 流水號 + 資訊：放得下就同一行，放不下時流水號自成一行（不從中間斷）。 */}
              <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                {selectedCourse.pk && (
                  <span className="whitespace-nowrap">
                    流水號 {selectedCourse.pk}
                  </span>
                )}
                <span className="min-w-0">
                  {[
                    selectedCourse.teacher,
                    Array.from(
                      new Set(
                        selectedCourse.sessions
                          .map((s) => s.classroom)
                          .filter(Boolean)
                      )
                    ).join("、") || null,
                    ...selectedCourse.sessions.map(
                      (s) =>
                        `${weekdayLabel(s.weekday)} ${
                          formatPeriods(s.periods) || "—"
                        } 節`
                    ),
                  ]
                    .filter(Boolean)
                    .join("・")}
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => {
                onRemove(selectedCourse.id);
                setSelectedId(null);
              }}
            >
              移除
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

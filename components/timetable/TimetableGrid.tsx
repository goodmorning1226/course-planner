"use client";

import { useState } from "react";
import type { CourseWithSessions, Weekday } from "@/lib/courses/types";
import { PERIOD_CODES, getPeriodTime } from "@/lib/courses/periods";
import { buildSlotIndex, cellKey } from "@/lib/courses/conflicts";
import { formatPeriods } from "@/lib/courses/periods";
import { weekdayLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Desktop weekly grid: columns = Mon–Sun, rows = periods 0–10, A–D.
// A course occupies every (weekday, period) cell it meets in. Courses sharing a
// slot are simply shown as separate boxes (no conflict highlight). Clicking a
// course selects THAT course — all of its cells are highlighted and a detail
// panel below shows only that course's info.

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const ALL_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export function TimetableGrid({
  courses,
  onRemove,
  showWeekend = false,
}: {
  courses: CourseWithSessions[];
  onRemove: (courseId: string) => void;
  showWeekend?: boolean;
}) {
  const slots = buildSlotIndex(courses);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Hovering any cell of a course highlights ALL of its cells (CSS :hover only
  // covers the single hovered cell, so we track it ourselves).
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const DAYS = showWeekend ? ALL_DAYS : WEEKDAYS;

  const selectedCourse = selectedId
    ? courses.find((c) => c.id === selectedId) ?? null
    : null;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-xs">
          <thead>
            <tr className="bg-muted/40">
              <th className="w-16 border-b border-border p-2 font-bold text-muted-foreground">
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
            {PERIOD_CODES.map((period) => (
              <tr key={period}>
                <td className="border-b border-border p-1 text-center text-muted-foreground">
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
                              title={c.course_name}
                              className={cn(
                                "w-full rounded-sm p-1 text-left transition-colors",
                                c.id === hoveredId
                                  ? "bg-foreground/20 text-foreground"
                                  : "bg-muted",
                                c.id === selectedId && "ring-2 ring-foreground/40"
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
            <div className="min-w-0 space-y-1">
              {/* 標題行：課名 + 流水號（班次）。 */}
              <p className="text-sm font-bold">
                {selectedCourse.course_name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {[
                    selectedCourse.pk && `流水號 ${selectedCourse.pk}`,
                    selectedCourse.class_group &&
                      `班次 ${selectedCourse.class_group}`,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </span>
              </p>
              {/* 次行：教師・教室・星期 節次。 */}
              <p className="text-xs text-muted-foreground">
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
              </p>
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

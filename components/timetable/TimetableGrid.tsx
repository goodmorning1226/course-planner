"use client";

import { useState } from "react";
import type { CourseWithSessions, PeriodCode, Weekday } from "@/lib/courses/types";
import { PERIOD_CODES } from "@/lib/courses/periods";
import { buildSlotIndex, cellKey } from "@/lib/courses/conflicts";
import { formatPeriods } from "@/lib/courses/periods";
import { weekdayLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConflictBadge } from "./ConflictBadge";

// Desktop weekly grid: columns = Mon–Sun, rows = periods 0–10, A–D.
// A course occupies every (weekday, period) cell it meets in. Clicking an
// occupied cell opens a detail panel below the grid (stable & clear, rather
// than a floating popover); conflict cells (>1 course) show a ConflictBadge.

const DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

interface SelectedCell {
  day: Weekday;
  period: PeriodCode;
}

export function TimetableGrid({
  courses,
  onRemove,
}: {
  courses: CourseWithSessions[];
  onRemove: (courseId: string) => void;
}) {
  const slots = buildSlotIndex(courses);
  const [selected, setSelected] = useState<SelectedCell | null>(null);

  const selectedCourses = selected
    ? slots.get(cellKey(selected.day, selected.period)) ?? []
    : [];

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="bg-muted/40">
              <th className="w-10 border-b border-border p-2 font-medium text-muted-foreground">
                節次
              </th>
              {DAYS.map((d) => (
                <th
                  key={d}
                  className="border-b border-l border-border p-2 font-medium text-muted-foreground"
                >
                  {weekdayLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIOD_CODES.map((period) => (
              <tr key={period}>
                <td className="border-b border-border p-1 text-center font-medium text-muted-foreground">
                  {period}
                </td>
                {DAYS.map((day) => {
                  const cell = slots.get(cellKey(day, period)) ?? [];
                  const isConflict = cell.length > 1;
                  const isSelected =
                    selected?.day === day && selected?.period === period;
                  return (
                    <td
                      key={day}
                      className="border-b border-l border-border p-1 align-top"
                    >
                      {cell.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelected({ day, period })}
                          title={cell.map((c) => c.course_name).join("、")}
                          className={cn(
                            "flex w-full flex-col gap-0.5 rounded-sm p-1 text-left transition-colors",
                            isConflict
                              ? "bg-[hsl(var(--warning))]/10 ring-1 ring-[hsl(var(--warning))]/40"
                              : "bg-muted hover:bg-muted/70",
                            isSelected && "ring-2 ring-foreground/40"
                          )}
                        >
                          {isConflict && <ConflictBadge count={cell.length} />}
                          {cell.slice(0, 2).map((c) => (
                            <span key={c.id} className="truncate text-[11px]">
                              {c.course_name}
                            </span>
                          ))}
                          {cell.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{cell.length - 2}
                            </span>
                          )}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Expanded detail for the clicked cell. */}
      {selected && selectedCourses.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {weekdayLabel(selected.day)}・第 {selected.period} 節
              {selectedCourses.length > 1 && (
                <ConflictBadge count={selectedCourses.length} className="ml-2" />
              )}
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              關閉
            </button>
          </div>
          <ul className="space-y-3">
            {selectedCourses.map((c) => (
              <SlotCourse
                key={c.id}
                course={c}
                day={selected.day}
                onRemove={onRemove}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SlotCourse({
  course,
  day,
  onRemove,
}: {
  course: CourseWithSessions;
  day: Weekday;
  onRemove: (courseId: string) => void;
}) {
  // Show the session(s) that meet on this weekday.
  const daySessions = course.sessions.filter((s) => s.weekday === day);
  return (
    <li className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{course.course_name}</p>
        <p className="text-xs text-muted-foreground">
          {[course.pk && `流水號 ${course.pk}`, course.class_group && `班次 ${course.class_group}`, course.teacher, course.building_or_college]
            .filter(Boolean)
            .join("・")}
        </p>
        {daySessions.map((s) => (
          <p key={s.id} className="text-xs text-muted-foreground">
            {s.raw_time_text || "—"}・節次 {formatPeriods(s.periods) || "—"}・
            {s.classroom || "—"}
          </p>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={() => onRemove(course.id)}>
        移除
      </Button>
    </li>
  );
}

"use client";

import type { CourseWithSessions, Weekday } from "@/lib/courses/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPeriods } from "@/lib/courses/periods";
import { weekdayLabel } from "@/lib/utils";

// Mobile list-based timetable. Groups course sessions by weekday:
//   3-4節｜課名｜教室｜教師
// Courses sharing a slot are just listed normally (no conflict highlight).

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5];
const ALL_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export function TimetableListMobile({
  courses,
  onRemove,
  showWeekend = false,
}: {
  courses: CourseWithSessions[];
  onRemove: (courseId: string) => void;
  showWeekend?: boolean;
}) {
  const DAYS = showWeekend ? ALL_DAYS : WEEKDAYS;

  return (
    <div className="space-y-5">
      {DAYS.map((day) => {
        const rows = courses.flatMap((course) =>
          course.sessions
            .filter((s) => s.weekday === day)
            .map((s) => ({ course, session: s }))
        );
        if (rows.length === 0) return null;

        // Sort rows within a day by their first period's grid order.
        rows.sort(
          (a, b) =>
            periodSortKey(a.session.periods[0]) -
            periodSortKey(b.session.periods[0])
        );

        return (
          <section key={day} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {weekdayLabel(day)}
            </h2>
            {rows.map(({ course, session }) => {
              return (
                <Card key={session.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="font-medium text-muted-foreground">
                          {formatPeriods(session.periods) || "—"} 節
                        </span>
                        <span className="font-medium">{course.course_name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[session.classroom, course.teacher, course.pk && `流水號 ${course.pk}`]
                          .filter(Boolean)
                          .join("｜") || "—"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRemove(course.id)}
                    >
                      移除
                    </Button>
                  </div>
                </Card>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

const PERIOD_RANK: Record<string, number> = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, "10": 10, A: 11, B: 12, C: 13, D: 14,
};
function periodSortKey(p: string | undefined): number {
  return p ? PERIOD_RANK[p] ?? 99 : 99;
}

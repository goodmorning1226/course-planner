"use client";

import type { CourseSession, CourseWithSessions } from "@/lib/courses/types";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { weekdayLabel, formatUpdatedAt } from "@/lib/utils";
import { formatPeriods } from "@/lib/courses/periods";

// One course as a horizontal list row. Minimal-clean hierarchy:
//   course name = primary; serial/section/teacher = secondary; time/room = meta.
// Null fields are omitted (never rendered as "null"/"—").
export function CourseCard({
  course,
  isSelected = false,
  onToggle,
}: {
  course: CourseWithSessions;
  isSelected?: boolean;
  onToggle?: (course: CourseWithSessions) => void;
}) {
  // Course-level secondary facts, missing ones dropped.
  const meta = [
    course.teacher && `教師 ${course.teacher}`,
    course.building_or_college && `建物/學院 ${course.building_or_college}`,
  ].filter(Boolean) as string[];

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        {/* Primary: course name */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-base font-semibold leading-snug">
            {course.course_name}
          </h3>
          {course.pk && <Badge>流水號 {course.pk}</Badge>}
          {course.class_group && <Badge>班次 {course.class_group}</Badge>}
        </div>

        {/* Secondary: teacher / building (omitted when absent) */}
        {meta.length > 0 && (
          <p className="text-xs text-muted-foreground">{meta.join("　·　")}</p>
        )}

        {/* Meta rows: one per session, time/room as badges */}
        {course.sessions.length > 0 ? (
          <ul className="space-y-1.5">
            {course.sessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">尚無時段資料</p>
        )}

        {/* Subtle, non-shouty provenance hint */}
        <p className="text-[11px] text-muted-foreground/70">
          暫定資料　·　最後爬取 {formatUpdatedAt(course.scraped_at)}
        </p>
      </div>

      {/* Action: clear add / added + remove */}
      <div className="flex shrink-0 items-center gap-2">
        {isSelected ? (
          <>
            <span className="text-xs font-medium text-foreground">已加入 ✓</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onToggle?.(course)}
              aria-label={`從課表移除 ${course.course_name}`}
            >
              移除
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={() => onToggle?.(course)}
            aria-label={`加入課表 ${course.course_name}`}
          >
            加入課表
          </Button>
        )}
      </div>
    </Card>
  );
}

function SessionRow({ session }: { session: CourseSession }) {
  const day = weekdayLabel(session.weekday);
  const periods = formatPeriods(session.periods);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {day && <span className="font-medium text-foreground">{day}</span>}
      {session.raw_time_text && (
        <span className="text-muted-foreground">{session.raw_time_text}</span>
      )}
      {periods && <Badge>節次 {periods}</Badge>}
      {session.classroom && (
        <Badge>{session.classroom}</Badge>
      )}
    </li>
  );
}

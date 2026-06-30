"use client";

import Link from "next/link";
import type {
  CourseSession,
  CourseWithSessionsAndMetadata,
} from "@/lib/courses/types";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, weekdayLabel } from "@/lib/utils";
import { formatPeriods } from "@/lib/courses/periods";
import { CourseClassification } from "./CourseClassification";
import { FlagIcon } from "@/components/icons/FlagIcon";

// 修課情報 ships with the v2 launch — keep the per-card button hidden until then.
// Flip to true to re-enable (the /course-info page + APIs already exist).
const SHOW_COURSE_INFO = false;

// 課程收藏 旗幟 — hidden for now. Flip to true to re-enable (the table + API +
// /favorites page already exist).
const SHOW_FAVORITE_FLAG = false;

// One course as a horizontal list row. Minimal-clean hierarchy:
//   course name = primary; serial/section/teacher = secondary; time/room = meta.
// Null fields are omitted (never rendered as "null"/"—").
export function CourseCard({
  course,
  isSelected = false,
  onToggle,
  infoCount,
  isFavorited = false,
  onToggleFavorite,
}: {
  course: CourseWithSessionsAndMetadata;
  isSelected?: boolean;
  onToggle?: (course: CourseWithSessionsAndMetadata) => void;
  /** 修課情報 totals (reviews + grade distributions); undefined until loaded. */
  infoCount?: { reviews: number; grades: number };
  /** 課程收藏 state + toggle. The flag renders only when a handler is given. */
  isFavorited?: boolean;
  onToggleFavorite?: (course: CourseWithSessionsAndMetadata) => void;
}) {
  const infoTotal = infoCount ? infoCount.reviews + infoCount.grades : null;
  const infoHref =
    `/course-info?name=${encodeURIComponent(course.course_name)}` +
    (course.teacher ? `&teacher=${encodeURIComponent(course.teacher)}` : "");
  // Course-level secondary facts, missing ones dropped.
  const meta = [
    course.teacher && `教師 ${course.teacher}`,
    course.building_or_college && `建物/學院 ${course.building_or_college}`,
  ].filter(Boolean) as string[];
  const removed = course.status === "removed";

  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between",
        removed && "opacity-75",
      )}
    >
      <div className="min-w-0 space-y-2">
        {/* Primary: course name (收藏旗幟 + 課名) */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {SHOW_FAVORITE_FLAG && onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(course)}
              aria-label={
                isFavorited
                  ? `取消收藏 ${course.course_name}`
                  : `收藏 ${course.course_name}`
              }
              aria-pressed={isFavorited}
              title={isFavorited ? "取消收藏" : "收藏課程"}
              className={cn(
                "shrink-0 rounded p-1 transition-colors hover:bg-muted",
                isFavorited ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <FlagIcon filled={isFavorited} className="h-4 w-4" />
            </button>
          )}
          <h3
            className={cn(
              "text-base font-semibold leading-snug",
              removed && "text-muted-foreground line-through",
            )}
          >
            {course.course_name}
          </h3>
          {removed && (
            <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]">
              停開
            </Badge>
          )}
          {course.pk && <Badge>流水號 {course.pk}</Badge>}
          {course.class_group && <Badge>班次 {course.class_group}</Badge>}
        </div>

        {/* Secondary: teacher / building (omitted when absent) */}
        {meta.length > 0 && (
          <p className="text-xs text-muted-foreground">{meta.join("　·　")}</p>
        )}

        {/* 校際課程：開放台大名額 (only on interschool/外校 courses) */}
        {course.interschool_quota != null && (
          <p className="text-xs font-medium text-[hsl(var(--warning))]">
            校際　開放台大名額 {course.interschool_quota}
            {course.interschool_taken != null &&
              `（已選 ${course.interschool_taken}）`}
          </p>
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

        {/* Classification (course_metadata / course_requirements) */}
        <CourseClassification
          metadata={course.metadata}
          requirements={course.requirements}
        />
      </div>

      {/* Action: 修課情報 + add/remove. Mobile: one right-aligned row, equal
          width, 修課情報 on the left. Desktop: stacked (add on top). */}
      <div className="flex shrink-0 items-center justify-end gap-2 sm:flex-col-reverse sm:items-end">
        {SHOW_COURSE_INFO && (
          <Link
            href={infoHref}
            aria-label={`修課情報 ${course.course_name}`}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-muted px-3 text-sm font-medium text-foreground transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
          >
            修課情報{infoTotal != null && `（${infoTotal}）`}
          </Link>
        )}
        <div className="flex items-center justify-end gap-2">
          {isSelected ? (
            <>
              <span className="text-xs font-medium text-foreground">
                已加入 ✓
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToggle?.(course)}
                aria-label={`從課表移除 ${course.course_name}`}
              >
                移除
              </Button>
            </>
          ) : removed ? (
            <span className="text-xs font-medium text-muted-foreground">
              已停開
            </span>
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
      {session.classroom && <Badge>{session.classroom}</Badge>}
    </li>
  );
}

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
import { StarRating } from "@/components/ui/StarRating";

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
  /** 修課情報 totals (reviews + grade distributions) + 總體評分 average;
      undefined until loaded. */
  infoCount?: { reviews: number; grades: number; rating?: number | null };
  /** 課程收藏 state + toggle. The flag renders only when a handler is given. */
  isFavorited?: boolean;
  onToggleFavorite?: (course: CourseWithSessionsAndMetadata) => void;
}) {
  const infoTotal = infoCount ? infoCount.reviews + infoCount.grades : null;
  const infoHref =
    `/course-info?name=${encodeURIComponent(course.course_name)}` +
    (course.teacher ? `&teacher=${encodeURIComponent(course.teacher)}` : "");
  // Course-level secondary facts, missing ones dropped. 流水號 leads this line.
  const meta = [
    course.pk && `流水號 ${course.pk}`,
    course.teacher && `教師 ${course.teacher}`,
    course.building_or_college && `開課地點 ${course.building_or_college}`,
  ].filter(Boolean) as string[];
  const removed = course.status === "removed";

  // Shared action elements — placed into two different layouts (mobile row vs
  // desktop column) below, so the button/flag/link logic isn't duplicated.
  const flagBtn =
    SHOW_FAVORITE_FLAG && onToggleFavorite ? (
      <button
        type="button"
        onClick={() => onToggleFavorite(course)}
        aria-pressed={isFavorited}
        aria-label={
          isFavorited
            ? `取消收藏 ${course.course_name}`
            : `收藏 ${course.course_name}`
        }
        title={isFavorited ? "已收藏" : "收藏課程"}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted",
          isFavorited ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <FlagIcon filled={isFavorited} className="h-4 w-4" />
      </button>
    ) : null;

  const infoLink = SHOW_COURSE_INFO ? (
    <Link
      href={infoHref}
      aria-label={`修課情報 ${course.course_name}`}
      className="text-sm font-medium text-foreground underline decoration-[0.5px] underline-offset-4 transition-opacity hover:opacity-70"
    >
      修課情報{infoTotal != null && `（${infoTotal}）`}
    </Link>
  ) : null;

  const actionBtn = removed ? (
    <span className="text-xs font-medium text-muted-foreground">已停開</span>
  ) : (
    <Button
      size="sm"
      variant={isSelected ? "outline" : "primary"}
      onClick={() => onToggle?.(course)}
      // Fixed width + nowrap so switching add/remove (filled vs outlined)
      // keeps the same box size and never wraps the 4-char label.
      className="w-[88px] whitespace-nowrap"
      aria-label={
        isSelected
          ? `移出課表 ${course.course_name}`
          : `加入課表 ${course.course_name}`
      }
    >
      {isSelected ? "移出課表" : "加入課表"}
    </Button>
  );

  return (
    <Card
      className={cn(
        "relative flex flex-col gap-3 p-4",
        removed && "opacity-75",
      )}
    >
      <div className="min-w-0 space-y-2">
        {/* Primary: 課名 + 總體評分 + 流水號/班次。右側留白避開右上角的旗子。 */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:pr-12">
          <h3
            className={cn(
              "text-base font-semibold leading-snug",
              removed && "text-muted-foreground line-through",
            )}
          >
            {course.course_name}
          </h3>
          {/* 總體評分 stars (only when there are reviews) */}
          {infoCount?.rating != null && (
            <span
              className="inline-flex items-center gap-1"
              title={`整體評分 ${infoCount.rating.toFixed(1)}`}
            >
              <StarRating value={infoCount.rating} size={14} />
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {infoCount.rating.toFixed(1)}
              </span>
            </span>
          )}
          {removed && (
            <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]">
              停開
            </Badge>
          )}
          {course.class_group && <Badge>班次 {course.class_group}</Badge>}
        </div>

        {/* Secondary: teacher / building (omitted when absent) */}
        {meta.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {meta.map((item, i) => (
              <span key={i}>
                {i > 0 && <span className="text-muted-foreground/60">{"  ·  "}</span>}
                <span className="whitespace-nowrap">{item}</span>
              </span>
            ))}
          </p>
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

      {/* 電腦版：旗子釘在卡片右上角（內容整寬，不佔用右側整欄）。 */}
      {flagBtn && (
        <div className="absolute right-4 top-4 hidden sm:block">{flagBtn}</div>
      )}

      {/* 電腦版：修課情報＋加入課表釘在卡片右下角，和內容同一區塊、不自成一列。
          與右上角旗子相同做法，內容維持整寬、不被按鈕欄擠到提早換行。 */}
      <div className="absolute bottom-4 right-4 hidden items-center gap-3 sm:flex">
        {infoLink}
        {actionBtn}
      </div>

      {/* 手機版：內容下方一列 — 修課情報（左）＋ 旗子＋加入課表（右）。 */}
      <div className="flex items-center gap-3 sm:hidden">
        {infoLink}
        <div className="ml-auto flex items-center gap-3">
          {flagBtn}
          {actionBtn}
        </div>
      </div>
    </Card>
  );
}

function SessionRow({ session }: { session: CourseSession }) {
  const day = weekdayLabel(session.weekday);
  const periods = formatPeriods(session.periods);
  // Drop a leading weekday marker like "(三)" — the day is already shown.
  const time = session.raw_time_text
    ?.replace(/^[（(][一二三四五六日][）)]\s*/, "")
    .trim();
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {(day || time) && (
        // day (black) + time (muted) with no gap between them.
        <span className="font-medium text-muted-foreground">
          {day}
          {day && time ? " " : ""}
          {time}
        </span>
      )}
      {periods && <Badge>節次 {periods}</Badge>}
      {session.classroom && <Badge>{session.classroom}</Badge>}
    </li>
  );
}

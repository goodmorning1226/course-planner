import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const WEEKDAY_LABELS = ["", "週一", "週二", "週三", "週四", "週五", "週六", "週日"];

/** 1 → "週一". Returns "" for out-of-range. */
export function weekdayLabel(day: number | null | undefined): string {
  if (day == null || day < 1 || day > 7) return "";
  return WEEKDAY_LABELS[day];
}

/** Format an ISO timestamp as "YYYY/MM/DD HH:mm" in Taipei time for the
 *  disclaimer line. Pinned to Asia/Taipei so the displayed time is identical
 *  regardless of the server's timezone (UTC on Vercel vs. local UTC+8). */
export function formatUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("year")}/${p("month")}/${p("day")} ${p("hour")}:${p("minute")}`;
}

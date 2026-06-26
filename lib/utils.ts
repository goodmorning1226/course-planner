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

/** Format an ISO timestamp as "YYYY/MM/DD HH:mm" for the disclaimer line. */
export function formatUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

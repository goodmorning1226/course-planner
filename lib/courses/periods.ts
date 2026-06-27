// NTU period (節次) table and time-range → period conversion.
//
// Standard NTU bell schedule. Example required by the spec:
//   "10:20-12:10" → ["3", "4"]
//   "13:20-15:10" → ["6", "7"]

import type { PeriodCode } from "./types";

export const NTU_PERIODS = [
  { code: "0", start: "07:10", end: "08:00" },
  { code: "1", start: "08:10", end: "09:00" },
  { code: "2", start: "09:10", end: "10:00" },
  { code: "3", start: "10:20", end: "11:10" },
  { code: "4", start: "11:20", end: "12:10" },
  { code: "5", start: "12:20", end: "13:10" },
  { code: "6", start: "13:20", end: "14:10" },
  { code: "7", start: "14:20", end: "15:10" },
  { code: "8", start: "15:30", end: "16:20" },
  { code: "9", start: "16:30", end: "17:20" },
  { code: "10", start: "17:30", end: "18:20" },
  { code: "A", start: "18:25", end: "19:15" },
  { code: "B", start: "19:20", end: "20:10" },
  { code: "C", start: "20:15", end: "21:05" },
  { code: "D", start: "21:10", end: "22:00" },
] as const;

/** Ordered list of valid period codes. */
export const PERIOD_CODES = [
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "A", "B", "C", "D",
] as const;

const CODE_INDEX = new Map<string, number>(
  NTU_PERIODS.map((p, i) => [p.code, i])
);

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

/**
 * Parse a time range string into normalized start/end "HH:MM".
 *
 * Accepts these separators (with optional surrounding spaces):
 *   "-"  hyphen-minus            "10:20-12:10"
 *   "~"  tilde / fullwidth tilde "10:20 ~ 12:10"
 *   "－" fullwidth hyphen-minus  "10:20－12:10"
 *   "–"  en dash                 "10:20–12:10"
 *   "—"  em dash                 "10:20—12:10"
 *
 * Returns null on anything it cannot parse (never throws).
 */
export function parseTimeRange(
  raw: string | null | undefined
): { start: string; end: string } | null {
  if (!raw) return null;
  const m = raw
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*[-~–—－～]\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;

  const sh = +m[1], sm = +m[2], eh = +m[3], em = +m[4];
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;

  return { start: `${pad2(sh)}:${pad2(sm)}`, end: `${pad2(eh)}:${pad2(em)}` };
}

/**
 * Convert a raw time range (e.g. "10:20-12:10") into the NTU periods it spans.
 * A period is included when its slot overlaps the given range.
 * Unparseable input → [] (never throws, so one bad row can't break a batch).
 */
export function convertTimeRangeToPeriods(
  raw: string | null | undefined
): PeriodCode[] {
  const parsed = parseTimeRange(raw);
  if (!parsed) return [];

  const start = toMinutes(parsed.start);
  const end = toMinutes(parsed.end);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return [];

  const out: PeriodCode[] = [];
  for (const p of NTU_PERIODS) {
    const ps = toMinutes(p.start);
    const pe = toMinutes(p.end);
    // Overlap: period slot intersects [start, end).
    if (ps < end && pe > start) out.push(p.code);
  }
  return out;
}

/** True if `code` is a valid NTU period code. */
export function isValidPeriod(code: string): code is PeriodCode {
  return CODE_INDEX.has(code);
}

const TIME_BY_CODE = new Map(NTU_PERIODS.map((p) => [p.code, p]));

/** Start/end time for a period code, or null if unknown. */
export function getPeriodTime(
  code: PeriodCode
): { start: string; end: string } | null {
  return TIME_BY_CODE.get(code) ?? null;
}

/** Human-readable label for a period, e.g. "3（10:20–11:10）". */
export function getPeriodLabel(code: PeriodCode): string {
  const p = NTU_PERIODS.find((x) => x.code === code);
  if (!p) return code;
  return `${code}（${p.start}–${p.end}）`;
}

/**
 * Compactly format a set of periods, collapsing consecutive runs:
 *   ["3","4"]        → "3–4"
 *   ["2","3","4"]    → "2–4"
 *   ["3","4","A"]    → "3–4、A"
 *   []               → ""
 * Input is de-duplicated and sorted into canonical order first.
 */
export function formatPeriods(periods: PeriodCode[]): string {
  const sorted = [...new Set(periods)]
    .filter((p) => CODE_INDEX.has(p))
    .sort((a, b) => CODE_INDEX.get(a)! - CODE_INDEX.get(b)!);
  if (sorted.length === 0) return "";

  const groups: PeriodCode[][] = [];
  for (const code of sorted) {
    const last = groups[groups.length - 1];
    if (last && CODE_INDEX.get(code)! === CODE_INDEX.get(last[last.length - 1])! + 1) {
      last.push(code);
    } else {
      groups.push([code]);
    }
  }
  return groups
    .map((g) => (g.length > 1 ? `${g[0]}–${g[g.length - 1]}` : g[0]))
    .join("、");
}

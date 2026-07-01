// 成績分布 A 版 — reconstruct a grade distribution from RELATIVE reports, and
// convert the existing per-bucket imported data (grade_distributions) into the
// same relative-report shape on the fly.
//
// NTU shows each student three numbers relative to THEIR grade: same% / above% /
// below% (sum 100). A single report therefore pins exactly ONE grade (the
// reporter's own = same%); above/below are undifferentiated lumps. Collecting
// reports across different grades reconstructs the true per-grade distribution:
// every grade that someone reported becomes a solid bar; still-unreported mass
// (above the top / below the bottom / gaps between) shows as "未細分" bands that
// shrink as coverage grows.

/** Grades high → low. Index 0 = best. Aligned with the bucket columns below. */
export const GRADE_ORDER = [
  "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "F",
] as const;
export type Grade = (typeof GRADE_ORDER)[number];

export interface RawReport {
  pivot: string; // reporter's grade
  same_pct: number | null;
  above_pct: number | null;
  below_pct: number | null;
}

/** A horizontal segment of the reconstructed bar. */
export interface Segment {
  /** Grade label for a known bar, or a band label like "更高 (未細分)". */
  label: string;
  pct: number;
  /** true = an exact, directly-reported grade; false = an unknown lump. */
  known: boolean;
}

/** A grade_distributions row's buckets (percentages, 0–100 or null). */
export interface LegacyBuckets {
  a_plus: number | null; a: number | null; a_minus: number | null;
  b_plus: number | null; b: number | null; b_minus: number | null;
  c_plus: number | null; c: number | null; c_minus: number | null;
  f: number | null;
}

/** Bucket columns in GRADE_ORDER order (index-aligned). */
const BUCKET_KEYS: (keyof LegacyBuckets)[] = [
  "a_plus", "a", "a_minus", "b_plus", "b", "b_minus", "c_plus", "c", "c_minus", "f",
];

const EPS = 0.01;
/** How far a distribution may sum from 100 and still count as "complete/齊". */
const COMPLETE_TOL = 1.5;

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/**
 * Reconstruct segments from a set of relative reports. Known grades render as
 * solid bars (exact %); the mass above the highest / below the lowest reported
 * grade, and any gaps between reported grades, render as "未細分" bands.
 */
export function reconstruct(reports: RawReport[]): { segments: Segment[]; pinned: number } {
  const same = new Map<number, number[]>();
  const above = new Map<number, number[]>();
  const below = new Map<number, number[]>();
  const push = (m: Map<number, number[]>, i: number, v: number | null) => {
    if (v == null) return;
    const arr = m.get(i);
    if (arr) arr.push(v);
    else m.set(i, [v]);
  };
  for (const r of reports) {
    const i = GRADE_ORDER.indexOf(r.pivot as Grade);
    if (i < 0) continue;
    push(same, i, r.same_pct);
    push(above, i, r.above_pct);
    push(below, i, r.below_pct);
  }

  const exact = new Map<number, number>();
  for (const [i, xs] of same) {
    const v = mean(xs);
    if (v != null) exact.set(i, v);
  }
  const reported = [...exact.keys()].sort((a, b) => a - b);
  if (reported.length === 0) return { segments: [], pinned: 0 };

  const aboveOf = (i: number) => Math.max(0, mean(above.get(i) ?? []) ?? 0);
  const belowOf = (i: number) => Math.max(0, mean(below.get(i) ?? []) ?? 0);

  const segments: Segment[] = [];
  const top = reported[0];
  const bottom = reported[reported.length - 1];

  const aboveLump = aboveOf(top);
  if (aboveLump > EPS) segments.push({ label: "更高 (未細分)", pct: aboveLump, known: false });

  for (let k = 0; k < reported.length; k++) {
    const i = reported[k];
    segments.push({ label: GRADE_ORDER[i], pct: exact.get(i)!, known: true });
    if (k < reported.length - 1) {
      const j = reported[k + 1];
      if (j > i + 1) {
        // grades (i+1 … j-1) = below(i) − exact(j) − below(j)
        const gap = belowOf(i) - exact.get(j)! - belowOf(j);
        if (gap > EPS) segments.push({ label: "中間 (未細分)", pct: gap, known: false });
      }
    }
  }

  const belowLump = belowOf(bottom);
  if (belowLump > EPS) segments.push({ label: "更低 (未細分)", pct: belowLump, known: false });

  const pinned = [...exact.values()].reduce((a, b) => a + b, 0);
  return { segments, pinned: Math.min(100, pinned) };
}

export type LegacyKind = "special" | "complete" | "partial";

/**
 * Convert a legacy per-bucket grade_distributions row into relative reports.
 *
 *  - special  : a single-report signature (contiguous, sums to 100) — one report
 *               whose above/below become 未細分 lumps. Recognises:
 *                 · 3 contiguous → middle is the pivot; top=above, bottom=below
 *                 · 2 contiguous anchored at A+ → pivot A+, above 0, below=lower
 *                 · 2 contiguous anchored at F  → pivot F,  below 0, above=upper
 *  - complete : sums to 100 but not a single-report signature — every non-null
 *               grade is exact (one report per grade; above/below derived), so
 *               it renders as all bars with no 未細分.
 *  - partial  : doesn't sum to 100 — the known buckets render as bars summing
 *               <100 (the caller decides whether to show it).
 */
export function legacyToReports(b: LegacyBuckets): { reports: RawReport[]; kind: LegacyKind } {
  const nonNull = BUCKET_KEYS
    .map((k, i) => ({ i, v: b[k] }))
    .filter((x): x is { i: number; v: number } => x.v != null);
  if (nonNull.length === 0) return { reports: [], kind: "partial" };

  const sum = nonNull.reduce((a, x) => a + x.v, 0);
  const complete = Math.abs(sum - 100) <= COMPLETE_TOL;
  const idxs = nonNull.map((x) => x.i);
  const contiguous = idxs.every((v, k) => k === 0 || v === idxs[k - 1] + 1);
  const last = GRADE_ORDER.length - 1;

  // Per-grade reports (above/below = sum of known higher/lower buckets).
  const perGrade = (): RawReport[] =>
    nonNull.map(({ i, v }) => ({
      pivot: GRADE_ORDER[i],
      same_pct: v,
      above_pct: nonNull.filter((x) => x.i < i).reduce((a, x) => a + x.v, 0),
      below_pct: nonNull.filter((x) => x.i > i).reduce((a, x) => a + x.v, 0),
    }));

  if (complete && contiguous) {
    if (nonNull.length === 3) {
      const [hi, mid, lo] = nonNull;
      return { reports: [{ pivot: GRADE_ORDER[mid.i], same_pct: mid.v, above_pct: hi.v, below_pct: lo.v }], kind: "special" };
    }
    if (nonNull.length === 2) {
      const [hi, lo] = nonNull; // hi.i < lo.i
      if (hi.i === 0) {
        return { reports: [{ pivot: "A+", same_pct: hi.v, above_pct: 0, below_pct: lo.v }], kind: "special" };
      }
      if (lo.i === last) {
        return { reports: [{ pivot: "F", same_pct: lo.v, above_pct: hi.v, below_pct: 0 }], kind: "special" };
      }
      // 2 contiguous in the middle → real two-grade distribution (complete).
    }
    if (nonNull.length === 1) {
      const only = nonNull[0];
      return { reports: [{ pivot: GRADE_ORDER[only.i], same_pct: only.v, above_pct: 0, below_pct: 0 }], kind: "special" };
    }
  }

  if (complete) return { reports: perGrade(), kind: "complete" };

  // Partial (doesn't sum to 100). The known buckets are bars; the leftover mass
  // U is localised as a 更高/更低/中間(未細分) lump when the present grades pin
  // its region — e.g. F present (bottom edge) ⇒ the leftover can only be ABOVE
  // the highest known grade. When two regions could hold it, we can't localise,
  // and the caller shows it as 無資料.
  const reports = perGrade();
  const U = 100 - sum;
  if (U > EPS) {
    const known = nonNull.map((x) => x.i);
    const minK = known[0];
    const maxK = known[known.length - 1];
    const aboveExists = minK > 0; // grades higher than the highest known
    const belowExists = maxK < GRADE_ORDER.length - 1; // grades lower than the lowest known
    const gapUppers: number[] = []; // upper-known grade bordering each internal gap
    for (let k = 0; k < known.length - 1; k++) {
      if (known[k + 1] > known[k] + 1) gapUppers.push(known[k]);
    }
    const middleExists = gapUppers.length > 0;
    const regionCount = (aboveExists ? 1 : 0) + (belowExists ? 1 : 0) + (middleExists ? 1 : 0);
    if (regionCount === 1) {
      const at = (i: number) => reports.find((r) => r.pivot === GRADE_ORDER[i])!;
      if (aboveExists) at(minK).above_pct = (at(minK).above_pct ?? 0) + U;
      else if (belowExists) at(maxK).below_pct = (at(maxK).below_pct ?? 0) + U;
      else if (gapUppers.length === 1) at(gapUppers[0]).below_pct = (at(gapUppers[0]).below_pct ?? 0) + U;
    }
  }
  return { reports, kind: "partial" };
}

export interface SemesterDist {
  segments: Segment[];
  pinned: number;
  /** Number of first-hand user reports behind this (excludes imported data). */
  reportCount: number;
  /** Whether imported grade_distributions data contributed. */
  hasLegacy: boolean;
}

/** Below this leftover % we don't bother drawing an 不確定 band (rounding). */
const UNCERTAIN_MIN = 1;

/**
 * Build one semester's distribution from first-hand user reports + (optionally)
 * the imported legacy row. Special/complete legacy always contributes; a
 * partial legacy row is only used when there are no user reports yet. Whatever
 * the source, the display is uniform: any mass the segments don't account for
 * (data isn't complete) is shown as a single "無資料" band, so incomplete rows
 * look the same as everything else — just with a no-data remainder.
 */
export function buildSemester(userReports: RawReport[], legacy?: LegacyBuckets | null): SemesterDist {
  let reports = [...userReports];
  let hasLegacy = false;
  if (legacy) {
    const { reports: legReports, kind } = legacyToReports(legacy);
    if (legReports.length > 0) {
      if (kind === "partial") {
        if (userReports.length === 0) {
          reports = legReports;
          hasLegacy = true;
        }
      } else {
        reports = [...reports, ...legReports];
        hasLegacy = true;
      }
    }
  }
  const { segments, pinned } = reconstruct(reports);

  // Mark any unaccounted mass as 不確定 (e.g. imported rows that don't sum to
  // 100, or a report that only gave the same-grade %).
  if (segments.length > 0) {
    const segSum = segments.reduce((a, s) => a + s.pct, 0);
    const leftover = 100 - segSum;
    if (leftover > UNCERTAIN_MIN) segments.push({ label: "無資料", pct: leftover, known: false });
  }

  return { segments, pinned, reportCount: userReports.length, hasLegacy };
}

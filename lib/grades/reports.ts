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
/** Two reports at the SAME grade disagreeing by more than this = conflict. */
const SPREAD_TOL = 5;
/** Slack before a sum/gap is called impossible (rounding-tolerant). */
const CONFLICT_TOL = 3;

// Aggregate repeated reports of the SAME quantity. Median (not mean) so one
// wrong entry can't skew it; and unlike mode it still works when honest reports
// round differently (23 vs 23.4) and so never repeat exactly.
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Reconstruct segments from a set of relative reports. Known grades render as
 * solid bars (exact %); the mass above the highest / below the lowest reported
 * grade, and any gaps between reported grades, render as "未細分" bands.
 *
 * Consistency (approach 2): reports are meant to be observations of the SAME
 * fact, so they must reconcile. We flag `conflict` (and give a reason) when they
 * don't — because a user can only edit their OWN report, we can't auto-fix the
 * bad one, so the UI degrades to "僅供參考" instead of pretending confidence:
 *   · same grade reported with widely different % (SPREAD_TOL)
 *   · a gap computes negative — reports around it contradict
 *   · the exact bars alone sum to more than 100%
 */
export function reconstruct(reports: RawReport[]): {
  segments: Segment[];
  pinned: number;
  conflict: boolean;
  conflictReason: string | null;
  /** Reported grade indices, ascending (highest grade first). */
  reported: number[];
  /** A 更高/更低 lump was drawn (that region's size is known). */
  aboveLumpPresent: boolean;
  belowLumpPresent: boolean;
  /** Upper-known index of each gap whose size is UNKNOWN (below data missing). */
  openGaps: number[];
} {
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

  let conflictReason: string | null = null;
  const flag = (reason: string) => {
    if (!conflictReason) conflictReason = reason;
  };

  const exact = new Map<number, number>();
  for (const [i, xs] of same) {
    // Same grade should be reported identically — flag wide disagreement.
    if (xs.length > 1 && Math.max(...xs) - Math.min(...xs) > SPREAD_TOL) {
      flag(`${GRADE_ORDER[i]} 有多筆回報比例差距過大`);
    }
    const v = median(xs);
    if (v != null) exact.set(i, v);
  }
  const reported = [...exact.keys()].sort((a, b) => a - b);
  if (reported.length === 0) {
    return { segments: [], pinned: 0, conflict: false, conflictReason: null, reported: [], aboveLumpPresent: false, belowLumpPresent: false, openGaps: [] };
  }

  // null = no data for that direction (UNKNOWN) — NOT zero. This is what lets us
  // merge incomplete imported rows with reports without inventing constraints.
  const aboveOf = (i: number): number | null => {
    const v = median(above.get(i) ?? []);
    return v == null ? null : Math.max(0, v);
  };
  const belowOf = (i: number): number | null => {
    const v = median(below.get(i) ?? []);
    return v == null ? null : Math.max(0, v);
  };

  const segments: Segment[] = [];
  const top = reported[0];
  const bottom = reported[reported.length - 1];

  const aboveTop = aboveOf(top);
  let aboveLumpPresent = false;
  if (aboveTop != null && aboveTop > EPS) {
    segments.push({ label: "更高 (未細分)", pct: aboveTop, known: false });
    aboveLumpPresent = true;
  }

  const openGaps: number[] = [];
  for (let k = 0; k < reported.length; k++) {
    const i = reported[k];
    segments.push({ label: GRADE_ORDER[i], pct: exact.get(i)!, known: true });
    if (k < reported.length - 1) {
      const j = reported[k + 1];
      if (j > i + 1) {
        const bi = belowOf(i);
        const bj = belowOf(j);
        if (bi == null || bj == null) {
          openGaps.push(i); // size unknown → buildSemester may place leftover here
        } else {
          // grades (i+1 … j-1) = below(i) − exact(j) − below(j)
          const gap = bi - exact.get(j)! - bj;
          if (gap < -CONFLICT_TOL) flag(`${GRADE_ORDER[i]} 與 ${GRADE_ORDER[j]} 的回報互相矛盾`);
          if (gap > EPS) segments.push({ label: "中間 (未細分)", pct: gap, known: false });
        }
      }
    }
  }

  const belowBottom = belowOf(bottom);
  let belowLumpPresent = false;
  if (belowBottom != null && belowBottom > EPS) {
    segments.push({ label: "更低 (未細分)", pct: belowBottom, known: false });
    belowLumpPresent = true;
  }

  const pinned = [...exact.values()].reduce((a, b) => a + b, 0);
  // Disjoint grade populations can't sum past 100.
  if (pinned > 100 + CONFLICT_TOL) flag("各等第回報加總超過 100%");

  return {
    segments,
    pinned: Math.min(100, pinned),
    conflict: conflictReason != null,
    conflictReason,
    reported,
    aboveLumpPresent,
    belowLumpPresent,
    openGaps,
  };
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

  // Partial (doesn't sum to 100). Contribute the known bars, but give above/below
  // ONLY when reliable — i.e. the chain up to A+ (for above) / down to F (for
  // below) is fully known — so merging with user reports never invents a false
  // "0 above/below" constraint. The unaccounted leftover is placed later by
  // buildSemester using the final merged picture (edge-localised or 無資料).
  const knownSet = new Set(nonNull.map((x) => x.i));
  const reliableAbove = (g: number) => {
    for (let x = 0; x < g; x++) if (!knownSet.has(x)) return false;
    return true;
  };
  const reliableBelow = (g: number) => {
    for (let x = g + 1; x <= last; x++) if (!knownSet.has(x)) return false;
    return true;
  };
  const reports = nonNull.map(({ i, v }) => ({
    pivot: GRADE_ORDER[i],
    same_pct: v,
    above_pct: reliableAbove(i) ? nonNull.filter((x) => x.i < i).reduce((a, x) => a + x.v, 0) : null,
    below_pct: reliableBelow(i) ? nonNull.filter((x) => x.i > i).reduce((a, x) => a + x.v, 0) : null,
  }));
  return { reports, kind: "partial" };
}

export interface SemesterDist {
  segments: Segment[];
  pinned: number;
  /** Number of first-hand user reports behind this (excludes imported data). */
  reportCount: number;
  /** Whether imported grade_distributions data contributed. */
  hasLegacy: boolean;
  /** Reports contradict each other — distribution is 僅供參考 (approach 2). */
  conflict: boolean;
  conflictReason: string | null;
}

/** Below this leftover % we don't bother drawing an 不確定 band (rounding). */
const UNCERTAIN_MIN = 1;

/**
 * Build one semester's distribution from first-hand user reports + (optionally)
 * the imported legacy row. Both ALWAYS contribute — a new report never drops the
 * imported data, they merge (the imported bars stay, the report fills in more).
 * Any mass the segments don't account for is placed as a lump: if exactly ONE
 * region is open (above the top / below the bottom / a single unknown gap) it's
 * localised there (更高/更低/中間 未細分), otherwise it's genuinely 無資料.
 */
export function buildSemester(userReports: RawReport[], legacy?: LegacyBuckets | null): SemesterDist {
  let reports = [...userReports];
  let hasLegacy = false;
  if (legacy) {
    const { reports: legReports } = legacyToReports(legacy);
    if (legReports.length > 0) {
      reports = [...reports, ...legReports];
      hasLegacy = true;
    }
  }
  const rec = reconstruct(reports);
  const segments = rec.segments;

  if (segments.length > 0) {
    const leftover = 100 - segments.reduce((a, s) => a + s.pct, 0);
    if (leftover > UNCERTAIN_MIN) {
      const top = rec.reported[0];
      const bottom = rec.reported[rec.reported.length - 1];
      const topOpen = top > 0 && !rec.aboveLumpPresent;
      const botOpen = bottom < GRADE_ORDER.length - 1 && !rec.belowLumpPresent;
      const openCount = (topOpen ? 1 : 0) + (botOpen ? 1 : 0) + rec.openGaps.length;
      if (openCount === 1 && topOpen) {
        segments.unshift({ label: "更高 (未細分)", pct: leftover, known: false });
      } else if (openCount === 1 && botOpen) {
        segments.push({ label: "更低 (未細分)", pct: leftover, known: false });
      } else if (openCount === 1 && rec.openGaps.length === 1) {
        const upper = GRADE_ORDER[rec.openGaps[0]];
        const idx = segments.findIndex((s) => s.known && s.label === upper);
        segments.splice(idx + 1, 0, { label: "中間 (未細分)", pct: leftover, known: false });
      } else {
        segments.push({ label: "無資料", pct: leftover, known: false });
      }
    }
  }

  return {
    segments,
    pinned: rec.pinned,
    reportCount: userReports.length,
    hasLegacy,
    conflict: rec.conflict,
    conflictReason: rec.conflictReason,
  };
}

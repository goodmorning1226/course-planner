// Timetable conflict (衝堂) detection.
//
// The spec allows overlapping courses but requires them to be clearly flagged.
// Two courses conflict when any of their sessions share the same weekday AND
// have at least one overlapping period.

import type { CourseWithSessions, PeriodCode, Weekday } from "./types";

/** A pair of courses that conflict. */
export interface ConflictPair {
  a: CourseWithSessions;
  b: CourseWithSessions;
}

/** Grid cell key, e.g. "1-3" for Monday period 3. */
export function cellKey(weekday: Weekday, period: PeriodCode): string {
  return `${weekday}-${period}`;
}

/** Do two courses share any (weekday, period) cell? */
export function hasCourseConflict(
  a: CourseWithSessions,
  b: CourseWithSessions
): boolean {
  if (a.id === b.id) return false;
  for (const sa of a.sessions) {
    if (sa.weekday == null) continue;
    for (const sb of b.sessions) {
      if (sb.weekday == null || sb.weekday !== sa.weekday) continue;
      const setB = new Set(sb.periods);
      if (sa.periods.some((p) => setB.has(p))) return true;
    }
  }
  return false;
}

/** All conflicting course pairs in the given list. */
export function findConflicts(courses: CourseWithSessions[]): ConflictPair[] {
  const pairs: ConflictPair[] = [];
  for (let i = 0; i < courses.length; i++) {
    for (let j = i + 1; j < courses.length; j++) {
      if (hasCourseConflict(courses[i], courses[j])) {
        pairs.push({ a: courses[i], b: courses[j] });
      }
    }
  }
  return pairs;
}

/** Convenience: ids of every course involved in at least one conflict. */
export function findConflictingCourseIds(
  courses: CourseWithSessions[]
): Set<string> {
  const ids = new Set<string>();
  for (const { a, b } of findConflicts(courses)) {
    ids.add(a.id);
    ids.add(b.id);
  }
  return ids;
}

/** Credits for a course, from the denormalised field or embedded metadata. */
export function courseCredits(course: CourseWithSessions): number {
  const c = course as CourseWithSessions & {
    metadata?: { credits?: number | null } | null;
  };
  return c.credits ?? c.metadata?.credits ?? 0;
}

/**
 * Maximum credits the user could realistically enrol in. Conflicting courses
 * can't both be taken, so this is the maximum-weight independent set over the
 * conflict graph (weight = credits). Non-conflicting courses are always counted;
 * within a conflicting cluster only the best non-overlapping combination counts.
 */
export function maxSelectableCredits(courses: CourseWithSessions[]): number {
  const n = courses.length;
  if (n === 0) return 0;

  const weight = courses.map(courseCredits);
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (hasCourseConflict(courses[i], courses[j])) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  // Solve each connected component independently and sum the results.
  const visited = new Array(n).fill(false);
  let total = 0;
  for (let s = 0; s < n; s++) {
    if (visited[s]) continue;
    const comp: number[] = [];
    const stack = [s];
    visited[s] = true;
    while (stack.length) {
      const u = stack.pop() as number;
      comp.push(u);
      for (const v of adj[u]) {
        if (!visited[v]) {
          visited[v] = true;
          stack.push(v);
        }
      }
    }
    total += mwisComponent(comp, adj, weight);
  }
  return total;
}

/** Max-weight independent set within one connected component. */
function mwisComponent(
  comp: number[],
  adj: number[][],
  weight: number[]
): number {
  // Pathological huge cluster: fall back to a greedy upper-ish estimate rather
  // than risk exponential blow-up (real timetables never hit this).
  if (comp.length > 28) return greedyMwis(comp, adj, weight);

  const remaining = new Set(comp);
  function solve(set: Set<number>): number {
    if (set.size === 0) return 0;
    // Find a node that still has a neighbour in the set (i.e. a real choice).
    let pivot = -1;
    for (const u of set) {
      if (adj[u].some((v) => set.has(v))) {
        pivot = u;
        break;
      }
    }
    if (pivot === -1) {
      // No edges left → take everything.
      let s = 0;
      for (const u of set) s += weight[u];
      return s;
    }
    // Exclude the pivot…
    const excl = new Set(set);
    excl.delete(pivot);
    const exclVal = solve(excl);
    // …or include it and drop its neighbours.
    const incl = new Set(set);
    incl.delete(pivot);
    for (const v of adj[pivot]) incl.delete(v);
    const inclVal = weight[pivot] + solve(incl);
    return Math.max(exclVal, inclVal);
  }
  return solve(remaining);
}

/** Greedy fallback: pick courses by credits desc, skipping conflicts. */
function greedyMwis(comp: number[], adj: number[][], weight: number[]): number {
  const order = [...comp].sort((a, b) => weight[b] - weight[a]);
  const chosen = new Set<number>();
  const blocked = new Set<number>();
  let total = 0;
  for (const u of order) {
    if (blocked.has(u)) continue;
    chosen.add(u);
    total += weight[u];
    for (const v of adj[u]) blocked.add(v);
  }
  void chosen;
  return total;
}

/**
 * Index every occupied (weekday, period) cell → the courses in it. Used by the
 * weekly grid to render and to spot conflicts (cells with >1 course).
 */
export function buildSlotIndex(
  courses: CourseWithSessions[]
): Map<string, CourseWithSessions[]> {
  const slots = new Map<string, CourseWithSessions[]>();
  for (const course of courses) {
    for (const session of course.sessions) {
      if (session.weekday == null) continue;
      for (const period of session.periods) {
        const key = cellKey(session.weekday, period);
        const list = slots.get(key) ?? [];
        // A course with two sessions in the same cell should appear once.
        if (!list.some((c) => c.id === course.id)) list.push(course);
        slots.set(key, list);
      }
    }
  }
  return slots;
}

/**
 * Like buildSlotIndex but keeps only the cells that actually conflict
 * (≥2 distinct courses). Keyed by "weekday-period".
 */
export function getConflictsBySlot(
  courses: CourseWithSessions[]
): Map<string, CourseWithSessions[]> {
  const conflicts = new Map<string, CourseWithSessions[]>();
  for (const [key, list] of buildSlotIndex(courses)) {
    if (list.length > 1) conflicts.set(key, list);
  }
  return conflicts;
}

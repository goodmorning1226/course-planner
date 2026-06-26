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

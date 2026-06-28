// Persist the course-search page state (query + filters + loaded results +
// scroll) to sessionStorage, so navigating to a course's 修課情報 and pressing
// Back restores exactly where the user was (filters, 大類, and scroll position).

import type { SearchFilters } from "@/components/courses/CourseFilters";
import type { CourseWithSessionsAndMetadata } from "@/lib/courses/types";

const KEY = "cp:courseSearch";

export interface CourseSearchSnapshot {
  q: string;
  filters: SearchFilters;
  items: CourseWithSessionsAndMetadata[];
  cursor: string | null;
  hasMore: boolean;
  total: number | null;
  scrollY: number;
}

/** The list-only portion CourseList hydrates from on Back-restore. */
export interface CourseListInitial {
  items: CourseWithSessionsAndMetadata[];
  cursor: string | null;
  hasMore: boolean;
  total: number | null;
  scrollY: number;
}

export function saveSearchSnapshot(s: CourseSearchSnapshot): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota / unavailable — skip persisting */
  }
}

export function loadSearchSnapshot(): CourseSearchSnapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CourseSearchSnapshot) : null;
  } catch {
    return null;
  }
}

"use client";

// Client-side "my timetable" store, backed by localStorage.
//
// For now (logged-out users) the selected courses live entirely in
// localStorage under `selected-courses-1151`. Cloud sync for logged-in users is
// layered on later — this hook stays the single source of truth for the UI.
//
// We store the full CourseWithSessions objects (not just ids) so the timetable
// page can render without re-fetching.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CourseWithSessions } from "@/lib/courses/types";

export const SELECTED_COURSES_KEY = "selected-courses-1151";

function readStore(): CourseWithSessions[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SELECTED_COURSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CourseWithSessions[]) : [];
  } catch {
    return [];
  }
}

function writeStore(courses: CourseWithSessions[]) {
  try {
    window.localStorage.setItem(
      SELECTED_COURSES_KEY,
      JSON.stringify(courses)
    );
  } catch {
    // Quota / private-mode failures are non-fatal for the UI.
  }
}

export interface SelectedCoursesApi {
  courses: CourseWithSessions[];
  /** True once the initial localStorage read has completed (avoids flicker). */
  ready: boolean;
  isSelected: (courseId: string) => boolean;
  add: (course: CourseWithSessions) => void;
  remove: (courseId: string) => void;
  toggle: (course: CourseWithSessions) => void;
  clear: () => void;
}

export function useSelectedCourses(): SelectedCoursesApi {
  const [courses, setCourses] = useState<CourseWithSessions[]>([]);
  const [ready, setReady] = useState(false);

  // Initial load.
  useEffect(() => {
    setCourses(readStore());
    setReady(true);
  }, []);

  // Keep multiple tabs in sync.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === SELECTED_COURSES_KEY) setCourses(readStore());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: CourseWithSessions[]) => {
    setCourses(next);
    writeStore(next);
  }, []);

  const ids = useMemo(() => new Set(courses.map((c) => c.id)), [courses]);

  const isSelected = useCallback((courseId: string) => ids.has(courseId), [ids]);

  const add = useCallback(
    (course: CourseWithSessions) => {
      if (ids.has(course.id)) return; // avoid duplicate add
      persist([...courses, course]);
    },
    [courses, ids, persist]
  );

  const remove = useCallback(
    (courseId: string) => {
      persist(courses.filter((c) => c.id !== courseId));
    },
    [courses, persist]
  );

  const toggle = useCallback(
    (course: CourseWithSessions) => {
      if (ids.has(course.id)) persist(courses.filter((c) => c.id !== course.id));
      else persist([...courses, course]);
    },
    [courses, ids, persist]
  );

  const clear = useCallback(() => persist([]), [persist]);

  return { courses, ready, isSelected, add, remove, toggle, clear };
}

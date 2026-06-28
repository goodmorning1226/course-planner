"use client";

// Unified "is this course in my timetable?" controller for the search page.
//
//   logged out → localStorage (selected-courses-1151) via useSelectedCourses
//   logged in  → the cloud timetable (source of truth): initial added-ids come
//                from GET /api/timetable; add/remove call POST/DELETE
//                /api/timetable/courses with optimistic update + rollback.
//
// The page resolves the added-ids ONCE here and passes isSelected down to every
// CourseCard — cards never call the API themselves.

import { useCallback, useEffect, useState } from "react";
import type { CourseWithSessions } from "@/lib/courses/types";
import { useSelectedCourses } from "./useSelectedCourses";
import { getClientId } from "@/lib/client-id";

export interface TimetableSelection {
  /** True once the relevant source (localStorage or cloud) has loaded. */
  ready: boolean;
  isSelected: (courseId: string) => boolean;
  toggle: (course: CourseWithSessions) => void;
  /** Number of courses currently in the timetable. */
  count: number;
  /** Transient error from the last failed cloud mutation. */
  error: string | null;
  clearError: () => void;
}

export function useTimetableSelection(
  userEmail: string | null
): TimetableSelection {
  const loggedIn = !!userEmail;
  const local = useSelectedCourses();

  const [cloudIds, setCloudIds] = useState<Set<string>>(new Set());
  const [cloudReady, setCloudReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the cloud timetable's course ids when logged in.
  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    setCloudReady(false);
    fetch("/api/timetable")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (!active) return;
        const ids = new Set<string>(
          (json.courses ?? []).map((c: CourseWithSessions) => c.id)
        );
        setCloudIds(ids);
        setCloudReady(true);
      })
      .catch(() => {
        if (!active) return;
        setError("載入雲端課表失敗，請重新整理。");
        setCloudReady(true);
      });
    return () => {
      active = false;
    };
  }, [loggedIn]);

  const addCloud = useCallback(async (course: CourseWithSessions) => {
    setError(null);
    setCloudIds((prev) => new Set(prev).add(course.id)); // optimistic
    try {
      const res = await fetch("/api/timetable/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setCloudIds((prev) => {
        const next = new Set(prev);
        next.delete(course.id); // rollback
        return next;
      });
      setError("加入失敗，請稍後再試。");
    }
  }, []);

  const removeCloud = useCallback(async (courseId: string) => {
    setError(null);
    setCloudIds((prev) => {
      const next = new Set(prev);
      next.delete(courseId); // optimistic
      return next;
    });
    try {
      const res = await fetch("/api/timetable/courses", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setCloudIds((prev) => new Set(prev).add(courseId)); // rollback
      setError("移除失敗，請稍後再試。");
    }
  }, []);

  // Anonymous visitors: report how many courses they have (PII-free) so the
  // admin 已排課人數 can include people who排課 without registering. Debounced.
  const anonCount = local.courses.length;
  useEffect(() => {
    if (loggedIn || !local.ready) return;
    const t = setTimeout(() => {
      fetch("/api/track-timetable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: getClientId(), courseCount: anonCount }),
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [loggedIn, local.ready, anonCount]);

  const isSelected = useCallback(
    (id: string) => (loggedIn ? cloudIds.has(id) : local.isSelected(id)),
    [loggedIn, cloudIds, local]
  );

  const toggle = useCallback(
    (course: CourseWithSessions) => {
      if (loggedIn) {
        if (cloudIds.has(course.id)) removeCloud(course.id);
        else addCloud(course);
      } else {
        local.toggle(course);
      }
    },
    [loggedIn, cloudIds, addCloud, removeCloud, local]
  );

  return {
    ready: loggedIn ? cloudReady : local.ready,
    isSelected,
    toggle,
    count: loggedIn ? cloudIds.size : local.courses.length,
    error,
    clearError: () => setError(null),
  };
}

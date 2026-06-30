"use client";

// "Is this course in my 課程收藏?" controller for the search page (and a toggle
// the favorites page reuses). Favorites are a logged-in feature: when logged
// out, the flag is never filled and tapping it surfaces a login hint.
//
// Mirrors useTimetableSelection: the page resolves the favorited ids ONCE here
// and passes isFavorited down to every card — cards never call the API.

import { useCallback, useEffect, useState } from "react";
import type { CourseWithSessions } from "@/lib/courses/types";

export interface FavoritesController {
  ready: boolean;
  isFavorited: (courseId: string) => boolean;
  toggle: (course: CourseWithSessions) => void;
  count: number;
  error: string | null;
  clearError: () => void;
}

export function useFavorites(userEmail: string | null): FavoritesController {
  const loggedIn = !!userEmail;
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(!loggedIn);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loggedIn) {
      setReady(true);
      return;
    }
    let active = true;
    setReady(false);
    fetch("/api/favorites")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (!active) return;
        setIds(new Set<string>((json.courses ?? []).map((c: CourseWithSessions) => c.id)));
        setReady(true);
      })
      .catch(() => {
        if (!active) return;
        setError("載入收藏失敗，請重新整理。");
        setReady(true);
      });
    return () => {
      active = false;
    };
  }, [loggedIn]);

  const add = useCallback(async (id: string) => {
    setError(null);
    setIds((prev) => new Set(prev).add(id)); // optimistic
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setIds((prev) => {
        const next = new Set(prev);
        next.delete(id); // rollback
        return next;
      });
      setError("收藏失敗，請稍後再試。");
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setError(null);
    setIds((prev) => {
      const next = new Set(prev);
      next.delete(id); // optimistic
      return next;
    });
    try {
      const res = await fetch("/api/favorites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setIds((prev) => new Set(prev).add(id)); // rollback
      setError("取消收藏失敗，請稍後再試。");
    }
  }, []);

  const isFavorited = useCallback((id: string) => ids.has(id), [ids]);

  const toggle = useCallback(
    (course: CourseWithSessions) => {
      if (!loggedIn) {
        setError("登入後即可收藏課程。");
        return;
      }
      if (ids.has(course.id)) remove(course.id);
      else add(course.id);
    },
    [loggedIn, ids, add, remove]
  );

  return { ready, isFavorited, toggle, count: ids.size, error, clearError: () => setError(null) };
}

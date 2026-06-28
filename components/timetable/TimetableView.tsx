"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CourseWithSessions } from "@/lib/courses/types";
import { TimetableGrid } from "./TimetableGrid";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSelectedCourses } from "@/lib/timetable/useSelectedCourses";
import { maxSelectableCredits } from "@/lib/courses/conflicts";
import { cn } from "@/lib/utils";

// Renders the user's timetable. Logged-out: courses come from localStorage.
// Logged-in: courses come from the cloud (GET /api/timetable); if localStorage
// also has courses, a merge prompt is offered.
export function TimetableView({ userEmail }: { userEmail: string | null }) {
  const loggedIn = !!userEmail;
  const local = useSelectedCourses();

  const [cloud, setCloud] = useState<CourseWithSessions[]>([]);
  const [cloudStatus, setCloudStatus] = useState<"loading" | "ready" | "error">(
    loggedIn ? "loading" : "ready"
  );

  // Weekend (Sat/Sun) columns are shown by default; the top-right「隱藏週末」
  // switch lets the user collapse them.
  const [showWeekend, setShowWeekend] = useState(true);

  const [mergeDismissed, setMergeDismissed] = useState(false);
  const [mergeStatus, setMergeStatus] = useState<"idle" | "merging" | "error">(
    "idle"
  );
  const [mergeError, setMergeError] = useState<string | null>(null);

  const fetchCloud = useCallback(async () => {
    setCloudStatus("loading");
    try {
      const res = await fetch("/api/timetable");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setCloud(json.courses ?? []);
      setCloudStatus("ready");
    } catch (err) {
      console.error("[TimetableView] load cloud failed:", err);
      setCloudStatus("error");
    }
  }, []);

  useEffect(() => {
    if (loggedIn) fetchCloud();
  }, [loggedIn, fetchCloud]);

  const courses = loggedIn ? cloud : local.courses;
  // 停開 (soft-deleted) courses are kept visible (struck-through) but can't be
  // taken, so they're excluded from the credit total.
  const removedCount = courses.filter((c) => c.status === "removed").length;
  const activeCourses = removedCount
    ? courses.filter((c) => c.status !== "removed")
    : courses;
  // "最多可選學分": conflicting courses can't both be taken, so this is the
  // max-weight independent set over the conflict graph (weight = credits).
  const totalCredits = maxSelectableCredits(activeCourses);

  // Remove: cloud (DELETE) or local depending on auth.
  const removeCloud = useCallback(
    async (courseId: string) => {
      setCloud((prev) => prev.filter((c) => c.id !== courseId)); // optimistic
      try {
        const res = await fetch("/api/timetable/courses", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId }),
        });
        if (!res.ok) throw new Error();
      } catch {
        fetchCloud(); // revert to server truth
      }
    },
    [fetchCloud]
  );
  const remove = loggedIn ? removeCloud : local.remove;

  // Clear the whole timetable. Cloud: delete every course (optimistic, revert on
  // failure); local: just clear the store.
  const clearAll = useCallback(async () => {
    if (!window.confirm("確定要清除整個課表嗎？此動作無法復原。")) return;
    if (!loggedIn) {
      local.clear();
      return;
    }
    const ids = cloud.map((c) => c.id);
    setCloud([]); // optimistic
    try {
      for (const courseId of ids) {
        const res = await fetch("/api/timetable/courses", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId }),
        });
        if (!res.ok) throw new Error();
      }
    } catch {
      fetchCloud(); // revert to server truth
    }
  }, [loggedIn, local, cloud, fetchCloud]);

  const showMerge =
    loggedIn && local.ready && local.courses.length > 0 && !mergeDismissed;

  async function doMerge() {
    setMergeStatus("merging");
    setMergeError(null);
    try {
      // POST each local course; duplicates are ignored server-side.
      for (const c of local.courses) {
        const res = await fetch("/api/timetable/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: c.id }),
        });
        if (!res.ok) throw new Error();
      }
      await fetchCloud();
      local.clear(); // mark synced — clears the local copy so we don't re-prompt
      setMergeStatus("idle");
    } catch {
      setMergeStatus("error");
      setMergeError("合併失敗，請稍後再試。");
    }
  }

  // --- Render ---------------------------------------------------------------

  const loading = loggedIn && cloudStatus === "loading";
  const ready = loggedIn ? cloudStatus !== "loading" : local.ready;

  return (
    <div className="space-y-5">
      {showMerge && (
        <Card className="space-y-3 border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5 p-4">
          <p className="text-sm">
            偵測到此瀏覽器有暫存課表（{local.courses.length} 門課），是否合併到雲端？
          </p>
          {mergeError && (
            <p className="text-sm text-[hsl(var(--warning))]">{mergeError}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={doMerge}
              disabled={mergeStatus === "merging"}
            >
              {mergeStatus === "merging" ? "合併中…" : "合併到雲端"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMergeDismissed(true)}
              disabled={mergeStatus === "merging"}
            >
              稍後再說
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
      ) : loggedIn && cloudStatus === "error" ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <p>載入雲端課表失敗。</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={fetchCloud}
          >
            重試
          </Button>
        </div>
      ) : ready && courses.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {removedCount > 0 && (
            <Card className="border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5 p-3 text-sm">
              有 {removedCount} 門課已<span className="font-medium text-[hsl(var(--warning))]">停開</span>
              （課表中以刪除線標示，不計入學分）。如不需要可移除。
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>已加入 {courses.length} 門課・最多 {totalCredits} 學分</span>

            {(() => {
              const hidden = !showWeekend; // switch is ON when weekends are hidden
              return (
                <button
                  type="button"
                  role="switch"
                  aria-checked={hidden}
                  onClick={() => setShowWeekend((v) => !v)}
                  className="ml-auto inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>隱藏週末</span>
                  <span
                    className={cn(
                      "relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors",
                      hidden ? "bg-foreground" : "bg-border"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-background shadow-sm transition-transform",
                        hidden ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </span>
                </button>
              );
            })()}
          </div>

          {/* Always the grid — it scrolls horizontally when space is tight. */}
          <TimetableGrid
            courses={courses}
            onRemove={remove}
            showWeekend={showWeekend}
          />

          <div className="flex justify-center pt-2">
            <Button size="sm" variant="outline" onClick={clearAll}>
              清除課表
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border p-12 text-center">
      <p className="text-sm text-muted-foreground">
        尚未加入任何課程，請先到課程搜尋加入暫排課表。
      </p>
      <Link href="/">
        <Button>前往課程搜尋</Button>
      </Link>
    </div>
  );
}

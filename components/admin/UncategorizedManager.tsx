"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ASSIGNABLE_CATEGORIES,
  GE_AREA_LABELS,
} from "@/lib/courses/classification";
import type { CourseWithSessions } from "@/lib/courses/types";
import { weekdayLabel, cn } from "@/lib/utils";

interface ApiResponse {
  data: CourseWithSessions[];
  total: number;
  nextOffset: number | null;
}

const GE_AREAS = Object.keys(GE_AREA_LABELS);

export function UncategorizedManager() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CourseWithSessions[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const reqId = useRef(0);

  const load = useCallback((query: string, offset: number) => {
    const id = ++reqId.current;
    if (offset === 0) setStatus("loading");
    fetch(`/api/admin/uncategorized?q=${encodeURIComponent(query)}&offset=${offset}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ApiResponse>;
      })
      .then((json) => {
        if (id !== reqId.current) return;
        setItems((prev) => (offset === 0 ? json.data : [...prev, ...json.data]));
        setTotal(json.total);
        setNextOffset(json.nextOffset);
        setStatus("ready");
      })
      .catch(() => id === reqId.current && setStatus("error"));
  }, []);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => load(q, 0), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  // Drop a course from the list once it's been classified.
  const onDone = useCallback((id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
    setTotal((t) => (t == null ? t : Math.max(0, t - 1)));
  }, []);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋未分類課程（課名 / 教師 / 流水號）"
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        />
        <p className="text-xs text-muted-foreground">
          {total == null ? "載入中…" : `共 ${total} 門未分類課程`}
        </p>
      </div>

      {status === "loading" && (
        <p className="py-6 text-center text-sm text-muted-foreground">載入中…</p>
      )}
      {status === "error" && (
        <p className="py-6 text-center text-sm text-[hsl(var(--warning))]">載入失敗，請稍後再試。</p>
      )}
      {status === "ready" && items.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">沒有符合的未分類課程 🎉</p>
      )}

      <div className="space-y-3">
        {items.map((course) => (
          <CourseRow key={course.id} course={course} onDone={onDone} />
        ))}
      </div>

      {nextOffset != null && status === "ready" && (
        <div className="py-2 text-center">
          <Button variant="outline" size="sm" onClick={() => load(q, nextOffset)}>
            載入更多
          </Button>
        </div>
      )}
    </div>
  );
}

function CourseRow({
  course,
  onDone,
}: {
  course: CourseWithSessions;
  onDone: (id: string) => void;
}) {
  const [cats, setCats] = useState<string[]>([]);
  const [ge, setGe] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, v: string) =>
    set((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          courseId: course.id,
          categories: cats,
          geCategories: cats.includes("general") ? ge : [],
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        setError(j?.error?.message ?? "儲存失敗。");
        return;
      }
      onDone(course.id);
    } catch {
      setError("儲存失敗。");
    } finally {
      setSaving(false);
    }
  }

  const sessionText = course.sessions
    .filter((s) => s.weekday != null)
    .map((s) => `週${weekdayLabel(s.weekday)} ${s.periods.join(",")}${s.classroom ? " " + s.classroom : ""}`)
    .join("｜");

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-semibold">{course.course_name}</span>
        {course.pk && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {course.pk}
          </span>
        )}
        {course.teacher && (
          <span className="text-xs text-muted-foreground">{course.teacher}</span>
        )}
      </div>
      {sessionText && <p className="text-xs text-muted-foreground">{sessionText}</p>}

      <div className="flex flex-wrap gap-1">
        {ASSIGNABLE_CATEGORIES.map((c) => (
          <Chip key={c.slug} active={cats.includes(c.slug)} onClick={() => toggle(setCats, c.slug)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {cats.includes("general") && (
        <div className="flex flex-wrap gap-1 border-t border-border pt-2">
          {GE_AREAS.map((a) => (
            <Chip key={a} active={ge.includes(a)} onClick={() => toggle(setGe, a)}>
              {a} {GE_AREA_LABELS[a]}
            </Chip>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-xs text-[hsl(var(--warning))]">{error}</span>}
        <Button size="sm" onClick={save} disabled={saving || cats.length === 0}>
          {saving ? "儲存中…" : "儲存分類"}
        </Button>
      </div>
    </Card>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

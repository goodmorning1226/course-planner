"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface Row {
  id: string;
  course_pk: string | null;
  course_name: string | null;
  building_or_college: string | null;
  change_type: string;
  detail: Record<string, unknown> | null;
}
interface Group {
  day: string;
  counts: Record<string, number>;
  rows: Row[];
}

const TYPE_LABEL: Record<string, string> = {
  added: "新增",
  removed: "停開",
  restored: "復開",
  updated: "異動",
  removal_skipped: "略過移除",
};
const TYPE_STYLE: Record<string, string> = {
  added: "bg-green-500/15 text-green-700 dark:text-green-400",
  removed: "bg-red-500/15 text-red-700 dark:text-red-400",
  restored: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  updated: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  removal_skipped: "bg-muted text-muted-foreground",
};

/** Render a from→to / sessions detail object into short human strings. */
function describe(detail: Record<string, unknown> | null): string[] {
  if (!detail) return [];
  const out: string[] = [];
  const fromTo = (k: string, label: string) => {
    const v = detail[k] as { from?: unknown; to?: unknown } | undefined;
    if (v) out.push(`${label}：${v.from ?? "—"} → ${v.to ?? "—"}`);
  };
  fromTo("name", "課名");
  fromTo("teacher", "教師");
  fromTo("class_group", "班次");
  fromTo("time", "時間");
  fromTo("classroom", "教室");
  const s = detail.sessions as { added?: string[]; removed?: string[] } | undefined;
  if (s) {
    if (s.removed?.length) out.push(`移除時段：${s.removed.join("、")}`);
    if (s.added?.length) out.push(`新增時段：${s.added.join("、")}`);
  }
  if (detail.reason) out.push(`原因：${String(detail.reason)}`);
  return out;
}

export function ChangesLog() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [days, setDays] = useState(14);

  useEffect(() => {
    let active = true;
    fetch(`/api/admin/changes?days=${days}`)
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((j) => active && setGroups(j.groups ?? []))
      .catch(() => active && setGroups([]));
    return () => {
      active = false;
    };
  }, [days]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">區間</span>
        {[7, 14, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={
              "rounded-md px-2 py-1 text-xs " +
              (days === d ? "bg-foreground text-background" : "bg-muted hover:opacity-80")
            }
          >
            {d} 天
          </button>
        ))}
      </div>

      {groups === null ? (
        <p className="text-sm text-muted-foreground">載入中…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">這段期間沒有課程變動。</p>
      ) : (
        groups.map((g) => (
          <Card key={g.day} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{g.day}</p>
              {Object.entries(g.counts).map(([t, n]) => (
                <span key={t} className={"rounded px-1.5 py-0.5 text-[11px] " + (TYPE_STYLE[t] ?? "bg-muted")}>
                  {TYPE_LABEL[t] ?? t} {n}
                </span>
              ))}
            </div>
            <ul className="space-y-1.5">
              {g.rows.map((r) => {
                const lines = describe(r.detail);
                return (
                  <li key={r.id} className="text-sm">
                    <span className={"mr-2 rounded px-1.5 py-0.5 text-[11px] " + (TYPE_STYLE[r.change_type] ?? "bg-muted")}>
                      {TYPE_LABEL[r.change_type] ?? r.change_type}
                    </span>
                    <span className="font-medium">{r.course_name ?? "—"}</span>
                    {r.building_or_college && (
                      <span className="ml-1 text-xs text-muted-foreground">· {r.building_or_college}</span>
                    )}
                    {r.course_pk && <span className="ml-1 text-xs text-muted-foreground">({r.course_pk})</span>}
                    {lines.length > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">— {lines.join("；")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}

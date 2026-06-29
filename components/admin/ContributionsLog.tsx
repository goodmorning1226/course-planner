"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface Row {
  id: string;
  kind: "review" | "grade";
  action: "add" | "edit" | "delete";
  course_name: string | null;
  teacher: string | null;
  semester: string | null;
  email: string;
  created_at: string;
}

const KIND_LABEL: Record<string, string> = { review: "評價", grade: "成績分布" };
const ACTION_LABEL: Record<string, string> = { add: "新增", edit: "編輯", delete: "刪除" };
const ACTION_STYLE: Record<string, string> = {
  add: "bg-green-500/15 text-green-700 dark:text-green-400",
  edit: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  delete: "bg-red-500/15 text-red-700 dark:text-red-400",
};

export function ContributionsLog() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState<"all" | "review" | "grade">("all");

  useEffect(() => {
    let active = true;
    setRows(null);
    fetch(`/api/admin/contributions?days=${days}&kind=${kind}`)
      .then((r) => (r.ok ? r.json() : { rows: [] }))
      .then((j) => active && setRows(j.rows ?? []))
      .catch(() => active && setRows([]));
    return () => {
      active = false;
    };
  }, [days, kind]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">類型</span>
          {(["all", "review", "grade"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={"rounded-md px-2 py-1 text-xs " + (kind === k ? "bg-foreground text-background" : "bg-muted hover:opacity-80")}>
              {k === "all" ? "全部" : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">區間</span>
          {[7, 30, 90, 365].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={"rounded-md px-2 py-1 text-xs " + (days === d ? "bg-foreground text-background" : "bg-muted hover:opacity-80")}>
              {d} 天
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <p className="text-sm text-muted-foreground">載入中…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">這段期間沒有紀錄。</p>
      ) : (
        <Card className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
              <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{KIND_LABEL[r.kind] ?? r.kind}</span>
              <span className={"rounded px-1.5 py-0.5 text-[11px] " + (ACTION_STYLE[r.action] ?? "bg-muted")}>
                {ACTION_LABEL[r.action] ?? r.action}
              </span>
              <span className="font-medium">{r.course_name ?? "—"}</span>
              {r.teacher && <span className="text-xs text-muted-foreground">{r.teacher}</span>}
              {r.semester && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{r.semester}</span>}
              <span className="ml-auto text-xs text-muted-foreground">{r.email}</span>
              <span className="text-xs text-muted-foreground">{r.created_at?.slice(0, 16).replace("T", " ")}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

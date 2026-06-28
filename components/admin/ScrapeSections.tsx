"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Section {
  key: string; // trigger value: BuildingDDL value | '%' | 'ntust'
  label: string;
  kind: "building" | "other" | "ntust";
  total_count: number;
  done_rooms: number;
  scraped_count: number;
  status: string | null;
  lastRunAt: string | null;
  changeCount: number;
}
interface Progress {
  running: { runId: string; section: string | null } | null;
  sections: Section[];
  full: { lastRunAt: string; status: string; finishedAt: string | null } | null;
}

function pct(s: Section): number {
  if (s.total_count > 0) return Math.round((s.done_rooms / s.total_count) * 100);
  return s.status === "done" ? 100 : 0;
}
function fmtWhen(iso: string | null): string {
  if (!iso) return "尚未爬取";
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ScrapeSections() {
  const [data, setData] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/scrape/progress");
      if (r.ok) setData(await r.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 2500);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  const running = !!data?.running;

  async function start(section: string) {
    setError(null);
    setStarting(section);
    try {
      const r = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section }),
      });
      const json = await r.json();
      if (!r.ok) {
        setError(json?.error?.message ?? "無法啟動爬蟲。");
        return;
      }
      load();
    } catch {
      setError("無法啟動爬蟲。");
    } finally {
      setStarting(null);
    }
  }

  const sections = data?.sections ?? [];

  return (
    <div className="space-y-4">
      {/* 全爬 */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">全部重新爬取</p>
          <p className="text-xs text-muted-foreground">
            爬取所有建物 + 其他，只更新有變動的課；新課自動分類，消失的課標為停開。
            {data?.full && <>　上次：{fmtWhen(data.full.lastRunAt)}（{data.full.status}）</>}
          </p>
        </div>
        <Button onClick={() => start("all")} disabled={running || !!starting}>
          {data?.running?.section === "all" ? "全爬中…" : starting === "all" ? "啟動中…" : "全爬"}
        </Button>
      </Card>

      {error && <p className="text-sm text-[hsl(var(--warning))]">{error}</p>}
      {running && (
        <p className="text-xs text-muted-foreground">
          目前正在爬取「{data?.running?.section}」，爬蟲一次只跑一個區段，其餘按鈕暫時停用。
        </p>
      )}

      {/* 各區段 */}
      <div className="grid gap-2 sm:grid-cols-2">
        {sections.map((s) => {
          const isThis = data?.running?.section === s.label || data?.running?.section === s.key;
          const p = pct(s);
          return (
            <Card key={s.key} className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.kind === "ntust"
                      ? "台科 校際（live API）"
                      : `${s.done_rooms}/${s.total_count} 間`}
                    {s.changeCount > 0 && <>　·　{s.changeCount} 異動</>}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => start(s.key)}
                  disabled={running || !!starting}
                >
                  {isThis ? "爬取中…" : "重爬"}
                </Button>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={
                    "h-full rounded-full transition-all " +
                    (s.status === "done" ? "bg-foreground/70" : isThis ? "bg-foreground" : "bg-foreground/40")
                  }
                  style={{ width: `${isThis || s.status ? p : 0}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">上次：{fmtWhen(s.lastRunAt)}</p>
            </Card>
          );
        })}
      </div>

      {sections.filter((s) => s.kind === "building").length === 0 && (
        <p className="text-xs text-muted-foreground">
          尚無建物清單 — 先執行一次「全爬」即可建立各建物/學院分區。
        </p>
      )}
    </div>
  );
}

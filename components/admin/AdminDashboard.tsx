"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Stats {
  courses: number;
  classified: number;
  generalEducation: number;
  timetableEntries: number;
  pageViews: number;
  users: number;
  usersWithCourses: number;
  lastScrape: { status: string; finished_at: string | null; course_count: number } | null;
}
interface BuildingProgress {
  building: string;
  scraped_count: number;
  total_count: number;
  done_rooms: number;
  status: string;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [buildings, setBuildings] = useState<BuildingProgress[]>([]);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/stats");
      if (r.ok) setStats(await r.json());
    } catch {
      /* ignore */
    }
  }, []);

  const poll = useCallback(async (id?: string | null) => {
    try {
      const r = await fetch(`/api/admin/scrape/progress${id ? `?runId=${id}` : ""}`);
      if (!r.ok) return;
      const json = await r.json();
      setRunId(json.runId);
      setBuildings(json.buildings ?? []);
      setRunStatus(json.run?.status ?? null);
      const active =
        json.run?.status === "running" ||
        (json.buildings ?? []).some((b: BuildingProgress) => b.status === "running");
      if (!active && timer.current) {
        clearInterval(timer.current);
        timer.current = null;
        loadStats();
      }
    } catch {
      /* ignore */
    }
  }, [loadStats]);

  const startPolling = useCallback((id: string | null) => {
    if (timer.current) clearInterval(timer.current);
    poll(id);
    timer.current = setInterval(() => poll(id), 2500);
  }, [poll]);

  useEffect(() => {
    loadStats();
    poll(); // resume latest run, if any
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [loadStats, poll]);

  async function startScrape() {
    setStarting(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/scrape", { method: "POST" });
      const json = await r.json();
      if (!r.ok) {
        setError(json?.error?.message ?? "無法啟動爬蟲。");
        return;
      }
      setRunStatus("running");
      setBuildings([]);
      startPolling(json.runId);
    } catch {
      setError("無法啟動爬蟲。");
    } finally {
      setStarting(false);
    }
  }

  const isRunning =
    runStatus === "running" || buildings.some((b) => b.status === "running");

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="課程數" value={stats?.courses} />
        <Metric label="已分類" value={stats?.classified} />
        <Metric label="通識課" value={stats?.generalEducation} />
        <Metric label="使用者" value={stats?.users} />
        <Metric label="瀏覽數" value={stats?.pageViews} />
        <Metric label="已排課人數" value={stats?.usersWithCourses} />
        <Metric label="課表項目" value={stats?.timetableEntries} />
        <Metric
          label="最後爬取"
          value={stats?.lastScrape ? `${stats.lastScrape.course_count} 門` : "—"}
        />
      </div>

      {/* Quick links */}
      <Link
        href="/admin/uncategorized"
        className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted"
      >
        <div>
          <p className="text-sm font-semibold">未分類課程</p>
          <p className="text-xs text-muted-foreground">搜尋並手動標上類別</p>
        </div>
        <span className="text-muted-foreground">→</span>
      </Link>

      {/* One-click scrape */}
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">重新爬取所有課程</p>
            <p className="text-xs text-muted-foreground">
              重新爬取全部建物，只更新有變動的課；新課才會重新分類。
            </p>
          </div>
          <Button onClick={startScrape} disabled={starting || isRunning}>
            {isRunning ? "爬取中…" : starting ? "啟動中…" : "重新爬取"}
          </Button>
        </div>
        {error && <p className="text-sm text-[hsl(var(--warning))]">{error}</p>}

        {/* Per-building progress bars */}
        {buildings.length > 0 && (
          <ul className="space-y-2">
            {buildings.map((b) => {
              const pct = b.total_count
                ? Math.round((b.done_rooms / b.total_count) * 100)
                : b.status === "done"
                ? 100
                : 0;
              return (
                <li key={b.building} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{b.building}</span>
                    <span className="text-muted-foreground">
                      {b.scraped_count} 課 · {b.done_rooms}/{b.total_count} 間
                      {b.status === "done" ? " ✓" : ""}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={
                        "h-full rounded-full transition-all " +
                        (b.status === "done"
                          ? "bg-foreground/70"
                          : "bg-foreground")
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {runId && buildings.length === 0 && isRunning && (
          <p className="text-xs text-muted-foreground">啟動中，等待第一棟建物…</p>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string | undefined }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">
        {value === undefined ? "…" : typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </Card>
  );
}

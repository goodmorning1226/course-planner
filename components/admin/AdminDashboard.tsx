"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { LineChart, type Point } from "./LineChart";

interface Stats {
  courses: number;
  coursesRemoved: number;
  classified: number;
  generalEducation: number;
  timetableEntries: number;
  pageViews: number;
  users: number;
  usersWithCourses: number;
  activeNow: number;
  lastScrape: { status: string; finished_at: string | null; course_count: number } | null;
  series?: {
    usersAllTime: Point[];
    usersToday: Point[];
    pvAllTime: Point[];
    pvToday: Point[];
    activeDaily: Point[];
    activeToday: Point[];
  };
}

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/stats");
      if (r.ok) setStats(await r.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadStats();
    const iv = setInterval(loadStats, 30_000); // keep 活躍人數 fresh
    return () => clearInterval(iv);
  }, [loadStats]);

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="活躍中（5 分鐘）" value={stats?.activeNow} live />
        <Metric label="課程數" value={stats?.courses} />
        <Metric label="已停開" value={stats?.coursesRemoved} />
        <Metric label="已分類" value={stats?.classified} />
        <Metric label="通識課" value={stats?.generalEducation} />
        <Metric label="使用者" value={stats?.users} />
        <Metric label="瀏覽數" value={stats?.pageViews} />
        <Metric label="已排課人數" value={stats?.usersWithCourses} />
      </div>

      {/* Trend charts. Daily charts: tap a point to pin that day's value. */}
      {stats?.series && (
        <div className="grid gap-3 sm:grid-cols-2">
          <LineChart title="活躍人數（每日）" data={stats.series.activeDaily} />
          <LineChart title="活躍人數（今日每小時）" data={stats.series.activeToday} />
          <LineChart title="使用者（全期累計）" data={stats.series.usersAllTime} />
          <LineChart title="使用者（今日每小時）" data={stats.series.usersToday} />
          <LineChart title="瀏覽數（全期累計）" data={stats.series.pvAllTime} />
          <LineChart title="瀏覽數（今日每小時）" data={stats.series.pvToday} />
        </div>
      )}

      {/* Quick links */}
      <div className="grid gap-3 sm:grid-cols-2">
        <NavCard href="/admin/daily" title="每日歷史" desc="選日期看每小時的歷史紀錄" />
        <NavCard href="/admin/contributions" title="評價／分布紀錄" desc="使用者新增/編輯/刪除紀錄" />
        <NavCard href="/admin/scrape" title="重新爬取" desc="分區/全部重爬，停開同步" />
        <NavCard href="/admin/changes" title="課程變動日誌" desc="新增 / 停開 / 異動紀錄" />
        <NavCard href="/admin/uncategorized" title="未分類課程" desc="搜尋並手動標上類別" />
      </div>
    </div>
  );
}

function NavCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border border-border p-4 transition-colors hover:bg-muted"
    >
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <span className="text-muted-foreground">→</span>
    </Link>
  );
}

function Metric({ label, value, live }: { label: string; value: number | string | undefined; live?: boolean }) {
  return (
    <Card className="p-3">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {live && <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />}
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold">
        {value === undefined ? "…" : typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </Card>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { LineChart, type Point } from "./LineChart";

interface Daily {
  date: string;
  usersHourly: Point[];
  pvHourly: Point[];
  activeHourly: Point[];
  totals: { users: number; pv: number; active: number };
}

const twToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
function addDays(d: string, n: number) {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function DailyHistory() {
  const today = twToday();
  const [date, setDate] = useState(today);
  const [data, setData] = useState<Daily | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/daily?date=${d}`);
      setData(r.ok ? await r.json() : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const atToday = date >= today;

  return (
    <div className="space-y-4">
      {/* date navigator */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setDate((d) => addDays(d, -1))}
          aria-label="前一天"
          className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
        >
          ←
        </button>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => setDate((d) => addDays(d, 1))}
          disabled={atToday}
          aria-label="後一天"
          className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-40"
        >
          →
        </button>
        {!atToday && (
          <button type="button" onClick={() => setDate(today)} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            回今天
          </button>
        )}
      </div>

      {/* daily totals */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="當日新使用者" value={data?.totals.users} />
        <Stat label="當日瀏覽數" value={data?.totals.pv} />
        <Stat label="當日活躍人數" value={data?.totals.active} />
      </div>

      {loading && <p className="text-center text-sm text-muted-foreground">載入中…</p>}

      {data && (
        <div className="grid gap-3 sm:grid-cols-2">
          <LineChart title={`使用者每小時 · ${data.date}`} data={data.usersHourly} />
          <LineChart title={`瀏覽數每小時 · ${data.date}`} data={data.pvHourly} />
          <LineChart title={`活躍人數每小時 · ${data.date}`} data={data.activeHourly} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card className="p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value === undefined ? "…" : value.toLocaleString()}</p>
    </Card>
  );
}

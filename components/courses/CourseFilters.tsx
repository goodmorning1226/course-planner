"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { PERIOD_CODES } from "@/lib/courses/periods";
import { weekdayLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Filter panel — 星期 / 節次 MULTI-select chips (OR within group), emitted
// debounced. (課程大類 and its 通識領域 A1–A8 / 系所 sub-rows live under the
// search bar in CoursesClient, not here.)

export interface SearchFilters {
  weekday?: number[];
  period?: string[];
  // classification — courseType / depts / deptGrade / geCategory are driven by
  // the 課程大類 area in CoursesClient, kept on the same state object.
  courseType?: string;
  depts?: string[]; // 系所大類: one or many dept codes
  deptGrade?: string; // "<deptCode>:<gradeId>" — only when a single dept is picked
  isGeneralEducation?: "true" | "false";
  geCategory?: string[]; // 通識領域 A1–A8: one or many (OR)
}

const DAYS = [1, 2, 3, 4, 5, 6, 7];

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

const CHIP = "rounded-sm border text-xs transition-colors px-2 py-1";
function chipCls(active: boolean) {
  return active
    ? "border-foreground bg-foreground text-background"
    : "border-border text-muted-foreground hover:bg-muted";
}

export function CourseFilters({
  value,
  onChange,
}: {
  value: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}) {
  const [draft, setDraft] = useState<SearchFilters>(value);
  const firstRun = useRef(true);

  // Re-sync when the parent changes filters elsewhere (e.g. the 課程大類 row).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  function toggleChip(key: "weekday" | "period", val: number | string) {
    setDraft((d) => {
      const current = (d[key] ?? []) as (number | string)[];
      const next = current.includes(val) ? current.filter((x) => x !== val) : [...current, val];
      const out: SearchFilters = { ...d };
      if (next.length === 0) delete out[key];
      else if (key === "weekday") out.weekday = next as number[];
      else out.period = next as string[];
      return out;
    });
  }

  const hasAny = Object.keys(draft).length > 0;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">篩選</p>
        {hasAny && (
          <button
            type="button"
            onClick={() => setDraft({})}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            清除
          </button>
        )}
      </div>

      <FilterGroup label="星期">
        <div className="flex flex-wrap gap-1">
          {DAYS.map((d) => (
            <button key={d} type="button" onClick={() => toggleChip("weekday", d)}
              className={cn(CHIP, chipCls(!!draft.weekday?.includes(d)))}>
              {weekdayLabel(d)}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="節次">
        <div className="flex flex-wrap gap-1">
          {PERIOD_CODES.map((p) => (
            <button key={p} type="button" onClick={() => toggleChip("period", p)}
              className={cn("h-7 w-7 rounded-sm border text-xs transition-colors", chipCls(!!draft.period?.includes(p)))}>
              {p}
            </button>
          ))}
        </div>
      </FilterGroup>
    </Card>
  );
}


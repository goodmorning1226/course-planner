"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { PERIOD_CODES } from "@/lib/courses/periods";
import { weekdayLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Filter panel: 星期 / 節次 / 建物·學院 / 教師.
// 星期 / 節次 / 建物·學院 are MULTI-select toggle chips (OR within a group);
// 教師 is free text. Changes are emitted to the parent debounced (300ms).

export interface SearchFilters {
  weekday?: number[];
  period?: string[];
  buildingOrCollege?: string[];
  teacher?: string;
}

const DAYS = [1, 2, 3, 4, 5, 6, 7];

// Building / college options, matching what the scraper stores in
// building_or_college (the NTU "建物 / 學院" dropdown labels).
const BUILDINGS = [
  "共同", "普通", "新生", "綜合", "博雅",
  "文學院", "理學院", "社科院", "醫學院", "工學院",
  "生農學院", "管理院", "公衛院", "電資院", "法律院", "生科院",
];

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

const CHIP_BASE = "rounded-sm border text-xs transition-colors";
function chipClass(active: boolean) {
  return cn(
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border text-muted-foreground hover:bg-muted"
  );
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

  // Debounce-emit draft to the parent.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Toggle a value in one of the multi-select array filters.
  function toggleChip(
    key: "weekday" | "period" | "buildingOrCollege",
    val: number | string
  ) {
    setDraft((d) => {
      const current = (d[key] ?? []) as (number | string)[];
      const next = current.includes(val)
        ? current.filter((x) => x !== val)
        : [...current, val];
      const out: SearchFilters = { ...d };
      if (next.length === 0) {
        delete out[key];
      } else if (key === "weekday") {
        out.weekday = next as number[];
      } else if (key === "period") {
        out.period = next as string[];
      } else {
        out.buildingOrCollege = next as string[];
      }
      return out;
    });
  }

  function setTeacher(val: string) {
    setDraft((d) => {
      const out = { ...d };
      if (val.trim() === "") delete out.teacher;
      else out.teacher = val;
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
            <button
              key={d}
              type="button"
              onClick={() => toggleChip("weekday", d)}
              className={cn(CHIP_BASE, "px-2 py-1", chipClass(!!draft.weekday?.includes(d)))}
            >
              {weekdayLabel(d)}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="節次">
        <div className="flex flex-wrap gap-1">
          {PERIOD_CODES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggleChip("period", p)}
              className={cn(CHIP_BASE, "h-7 w-7", chipClass(!!draft.period?.includes(p)))}
            >
              {p}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="建物 / 學院">
        <div className="flex flex-wrap gap-1">
          {BUILDINGS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => toggleChip("buildingOrCollege", b)}
              className={cn(
                CHIP_BASE,
                "px-2 py-1",
                chipClass(!!draft.buildingOrCollege?.includes(b))
              )}
            >
              {b}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="教師">
        <input
          value={draft.teacher ?? ""}
          onChange={(e) => setTeacher(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
          placeholder="教師姓名"
        />
      </FilterGroup>
    </Card>
  );
}

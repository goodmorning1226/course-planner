"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { PERIOD_CODES } from "@/lib/courses/periods";
import { GE_AREA_LABELS } from "@/lib/courses/classification";
import { weekdayLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";

// Filter panel. 星期 / 節次 / 建物·學院 are MULTI-select chips (OR within group);
// classification filters (課程大類 / 通識 / 必選修 / 來源 / 可信度) are single-select;
// 教師 / 授課對象 are free text. Emitted debounced (300ms).

export interface SearchFilters {
  weekday?: number[];
  period?: string[];
  buildingOrCollege?: string[];
  teacher?: string;
  // classification
  courseType?: string;
  isGeneralEducation?: "true" | "false";
  geCategory?: string;
  targetDepartment?: string;
  requirement?: string;
  classificationSource?: string;
  classificationConfidence?: string;
}

const DAYS = [1, 2, 3, 4, 5, 6, 7];
const BUILDINGS = [
  "共同", "普通", "新生", "綜合", "博雅",
  "文學院", "理學院", "社科院", "醫學院", "工學院",
  "生農學院", "管理院", "公衛院", "電資院", "法律院", "生科院",
];
type Opt = { value: string; label: string };
const COURSE_TYPES: Opt[] = [
  { value: "common_required", label: "共同必修" },
  { value: "common_elective", label: "共同選修" },
  { value: "general_education", label: "通識" },
  { value: "departmental", label: "院系所課程" },
  { value: "university_wide", label: "其他全校性" },
  { value: "freshman_seminar", label: "新生專題" },
  { value: "freshman_lecture", label: "新生講座" },
  { value: "writing", label: "寫作教學" },
  { value: "career_communication", label: "溝通表達與職涯" },
  { value: "military", label: "全民國防/軍訓" },
  { value: "unknown", label: "未分類" },
];
const GE_AREAS: Opt[] = Object.entries(GE_AREA_LABELS).map(([v, l]) => ({
  value: v,
  label: `${v} ${l}`,
}));
const REQUIREMENTS: Opt[] = [
  { value: "required", label: "必修" },
  { value: "elective", label: "選修" },
  { value: "required_elective", label: "必選修" },
  { value: "college_required", label: "院必修" },
  { value: "college_elective", label: "院選修" },
  { value: "common_required", label: "共同必修" },
  { value: "common_elective", label: "共同選修" },
  { value: "unknown", label: "未知" },
];
const SOURCES: Opt[] = [
  { value: "official_1151", label: "官方 115-1" },
  { value: "historical_match", label: "歷史推估" },
  { value: "course_code_inference", label: "課號推估" },
  { value: "unknown", label: "未知" },
];
const CONFIDENCES: Opt[] = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
  { value: "unknown", label: "未知" },
];

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

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Multi-select (array) toggle.
  function toggleChip(key: "weekday" | "period" | "buildingOrCollege", val: number | string) {
    setDraft((d) => {
      const current = (d[key] ?? []) as (number | string)[];
      const next = current.includes(val) ? current.filter((x) => x !== val) : [...current, val];
      const out: SearchFilters = { ...d };
      if (next.length === 0) delete out[key];
      else if (key === "weekday") out.weekday = next as number[];
      else if (key === "period") out.period = next as string[];
      else out.buildingOrCollege = next as string[];
      return out;
    });
  }

  // Single-select (click active to clear).
  function setSingle<K extends keyof SearchFilters>(key: K, val: string) {
    setDraft((d) => {
      const out = { ...d };
      if (d[key] === val) delete out[key];
      else (out[key] as unknown) = val;
      return out;
    });
  }

  function setText(key: "teacher" | "targetDepartment", val: string) {
    setDraft((d) => {
      const out = { ...d };
      if (val.trim() === "") delete out[key];
      else out[key] = val;
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

      <FilterGroup label="建物 / 學院">
        <div className="flex flex-wrap gap-1">
          {BUILDINGS.map((b) => (
            <button key={b} type="button" onClick={() => toggleChip("buildingOrCollege", b)}
              className={cn(CHIP, chipCls(!!draft.buildingOrCollege?.includes(b)))}>
              {b}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="課程大類">
        <div className="flex flex-wrap gap-1">
          {COURSE_TYPES.map((o) => (
            <button key={o.value} type="button" onClick={() => setSingle("courseType", o.value)}
              className={cn(CHIP, chipCls(draft.courseType === o.value))}>
              {o.label}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="是否通識">
        <div className="flex gap-1">
          {[{ value: "true", label: "是" }, { value: "false", label: "否" }].map((o) => (
            <button key={o.value} type="button" onClick={() => setSingle("isGeneralEducation", o.value)}
              className={cn(CHIP, chipCls(draft.isGeneralEducation === o.value))}>
              {o.label}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="通識領域">
        <div className="flex flex-wrap gap-1">
          {GE_AREAS.map((o) => (
            <button key={o.value} type="button" onClick={() => setSingle("geCategory", o.value)}
              className={cn(CHIP, chipCls(draft.geCategory === o.value))}>
              {o.label}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="必 / 選修">
        <div className="flex flex-wrap gap-1">
          {REQUIREMENTS.map((o) => (
            <button key={o.value} type="button" onClick={() => setSingle("requirement", o.value)}
              className={cn(CHIP, chipCls(draft.requirement === o.value))}>
              {o.label}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="授課對象 / 系所">
        <input
          value={draft.targetDepartment ?? ""}
          onChange={(e) => setText("targetDepartment", e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
          placeholder="例如：資訊管理學系"
        />
      </FilterGroup>

      <FilterGroup label="分類來源">
        <div className="flex flex-wrap gap-1">
          {SOURCES.map((o) => (
            <button key={o.value} type="button" onClick={() => setSingle("classificationSource", o.value)}
              className={cn(CHIP, chipCls(draft.classificationSource === o.value))}>
              {o.label}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="可信度">
        <div className="flex gap-1">
          {CONFIDENCES.map((o) => (
            <button key={o.value} type="button" onClick={() => setSingle("classificationConfidence", o.value)}
              className={cn(CHIP, chipCls(draft.classificationConfidence === o.value))}>
              {o.label}
            </button>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup label="教師">
        <input
          value={draft.teacher ?? ""}
          onChange={(e) => setText("teacher", e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
          placeholder="教師姓名"
        />
      </FilterGroup>
    </Card>
  );
}

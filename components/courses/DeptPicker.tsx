"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { COLLEGES, DEPT_BY_ID, DEPT_NAME } from "@/lib/courses/departments";
import { cn } from "@/lib/utils";

// 系所大類 picker. Searchable, multi-select (編號 + 系名, grouped by college).
// When exactly ONE department is selected, a 年級 dropdown appears — its options
// come from THAT department's own grade list (中文系 ≠ 法律系 ≠ 研究所).

export function DeptPicker({
  depts,
  deptGrade,
  onChange,
}: {
  depts: string[];
  deptGrade?: string;
  onChange: (next: { depts: string[]; deptGrade?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = new Set(depts);

  // Filter colleges/departments by 編號 or 系名 (case-insensitive).
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COLLEGES.map((col) => ({
      name: col.name,
      depts: col.depts.filter(
        (d) => !q || d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)
      ),
    })).filter((col) => col.depts.length > 0);
  }, [query]);

  function toggleDept(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const list = [...next];
    // 年級 only applies to a single department; drop it otherwise.
    onChange({ depts: list, deptGrade: list.length === 1 ? deptGrade : undefined });
  }

  // The single-selected department's own grade options (if any).
  const soleDept = depts.length === 1 ? DEPT_BY_ID[depts[0]] : undefined;
  const grades = soleDept?.grades ?? [];

  return (
    <div ref={boxRef} className="space-y-2">
      {/* Selected dept chips. */}
      {depts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {depts.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleDept(id)}
              className="inline-flex items-center gap-1 rounded-sm border border-foreground bg-foreground px-2 py-0.5 text-xs text-background"
              title="移除"
            >
              <span className="font-mono">{id}</span>
              {DEPT_NAME[id] ?? ""}
              <span aria-hidden className="opacity-70">×</span>
            </button>
          ))}
          {depts.length > 1 && (
            <button
              type="button"
              onClick={() => onChange({ depts: [], deptGrade: undefined })}
              className="rounded-sm px-1.5 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              清除系所
            </button>
          )}
        </div>
      )}

      {/* Combobox trigger + searchable dropdown. */}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="搜尋系所名稱 / 代號（可多選）"
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        />
        {open && (
          <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-border bg-background py-1 shadow-md">
            {results.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">找不到系所</p>
            )}
            {results.map((col) => (
              <div key={col.name}>
                <p className="sticky top-0 bg-background px-3 py-1 text-[11px] font-semibold text-muted-foreground">
                  {col.name}
                </p>
                {col.depts.map((d) => {
                  const active = selected.has(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDept(d.id)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted",
                        active && "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-3.5 w-3.5 shrink-0 rounded-[3px] border",
                          active ? "border-foreground bg-foreground" : "border-border"
                        )}
                      />
                      <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                        {d.id}
                      </span>
                      <span>{d.name}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 年級 — only when exactly one department is selected and it has grades. */}
      {grades.length > 0 && (
        <select
          value={deptGrade ?? ""}
          onChange={(e) =>
            onChange({ depts, deptGrade: e.target.value || undefined })
          }
          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        >
          <option value="">全部年級</option>
          {grades.map((g) => (
            <option key={g.id} value={`${depts[0]}:${g.id}`}>
              {g.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

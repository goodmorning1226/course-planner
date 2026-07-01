"use client";

// 成績分布 A 版 — distribution reconstructed from RELATIVE reports (plus the
// converted imported data). Each student only knows three numbers relative to
// their own grade (同等/以上/以下); we collect those and reconstruct: every
// reported grade is a solid bar; still-unknown mass shows as 未細分/不確定 bands
// that shrink as more people report.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/input";
import { SEMESTER_OPTIONS } from "@/lib/reviews/key";
import { GRADE_ORDER, type Segment } from "@/lib/grades/reports";
import { PencilIcon } from "@/components/icons/PencilIcon";

interface SemesterDist {
  semester: string;
  segments: Segment[];
  pinned: number;
  reportCount: number;
  hasLegacy: boolean;
}
interface MyReport {
  pivot: string;
  samePct: number | null;
  abovePct: number | null;
  belowPct: number | null;
}

function qs(name: string, teacher: string | null) {
  const p = new URLSearchParams({ name });
  if (teacher) p.set("teacher", teacher);
  return p.toString();
}

// Colour a segment: grey stripes for an unknown lump (未細分/不確定), else by
// grade tier.
function segClass(seg: Segment): string {
  if (!seg.known)
    return "bg-[repeating-linear-gradient(45deg,hsl(var(--muted-foreground)/0.18)_0_6px,hsl(var(--muted-foreground)/0.06)_6px_12px)]";
  const c = seg.label[0];
  if (c === "A") return "bg-emerald-500/80";
  if (c === "B") return "bg-sky-500/80";
  if (c === "C") return "bg-amber-500/80";
  return "bg-rose-500/80"; // F
}
function dotClass(seg: Segment): string {
  if (!seg.known) return "bg-muted-foreground/30";
  const c = seg.label[0];
  if (c === "A") return "bg-emerald-500";
  if (c === "B") return "bg-sky-500";
  if (c === "C") return "bg-amber-500";
  return "bg-rose-500";
}

export function GradeReports({
  courseName,
  teacher,
  loggedIn,
  onCount,
}: {
  courseName: string;
  teacher: string | null;
  loggedIn: boolean;
  onCount: (n: number) => void;
}) {
  const [semesters, setSemesters] = useState<SemesterDist[]>([]);
  const [myReports, setMyReports] = useState<Record<string, MyReport>>({});
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ initial?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/grade-reports?${qs(courseName, teacher)}`);
      const j = await r.json();
      const sems: SemesterDist[] = j.semesters ?? [];
      setSemesters(sems);
      setMyReports(j.myReports ?? {});
      onCount(sems.length);
    } finally {
      setLoading(false);
    }
  }, [courseName, teacher, onCount]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-muted-foreground">載入中…</p>
      ) : semesters.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚無成績分布資料。</p>
      ) : (
        <div className="space-y-5">
          {semesters.map((s) => (
            <div key={s.semester} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{s.semester}</span>
                </div>
                {loggedIn && (
                  <button
                    type="button"
                    onClick={() => setForm({ initial: s.semester })}
                    aria-label="編輯／補充這學期的回報"
                    title={myReports[s.semester] ? "編輯我的回報" : "補充這學期"}
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Stacked reconstructed bar */}
              <div className="flex h-5 w-full gap-px overflow-hidden rounded bg-muted">
                {s.segments.map((seg, i) => (
                  <div
                    key={i}
                    className={segClass(seg)}
                    style={{ width: `${seg.pct}%` }}
                    title={`${seg.label} ${seg.pct.toFixed(1)}%`}
                  />
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {s.segments.map((seg, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <span className={"inline-block h-2 w-2 rounded-sm " + dotClass(seg)} />
                    <span className={seg.known ? "text-foreground" : ""}>{seg.label}</span>
                    <span className="tabular-nums">{seg.pct.toFixed(1)}%</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {loggedIn ? (
        form ? (
          <ReportForm
            courseName={courseName}
            teacher={teacher}
            initialSemester={form.initial}
            myReports={myReports}
            onClose={() => setForm(null)}
            onSaved={() => {
              setForm(null);
              load();
            }}
          />
        ) : (
          <Button size="sm" variant="outline" onClick={() => setForm({})}>
            回報我的成績
          </Button>
        )
      ) : (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground underline">
            登入
          </Link>{" "}
          後即可回報你看到的成績比例，一起還原分布。
        </p>
      )}
    </div>
  );
}

// Submit/edit the viewer's OWN report: their grade + the three numbers NTU
// showed them (同等 required; 以上/以下 recommended so gaps can be located).
function ReportForm({
  courseName,
  teacher,
  initialSemester,
  myReports,
  onClose,
  onSaved,
}: {
  courseName: string;
  teacher: string | null;
  initialSemester?: string;
  myReports: Record<string, MyReport>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [semester, setSemester] = useState(initialSemester ?? SEMESTER_OPTIONS[0]);
  const mine = myReports[semester];
  const [pivot, setPivot] = useState(mine?.pivot ?? "A");
  const [same, setSame] = useState(mine?.samePct != null ? String(mine.samePct) : "");
  const [above, setAbove] = useState(mine?.abovePct != null ? String(mine.abovePct) : "");
  const [below, setBelow] = useState(mine?.belowPct != null ? String(mine.belowPct) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const m = myReports[semester];
    setPivot(m?.pivot ?? "A");
    setSame(m?.samePct != null ? String(m.samePct) : "");
    setAbove(m?.abovePct != null ? String(m.abovePct) : "");
    setBelow(m?.belowPct != null ? String(m.belowPct) : "");
  }, [semester, myReports]);

  const editing = !!myReports[semester];
  const sum = useMemo(() => {
    const n = (x: string) => (x === "" ? 0 : Number(x) || 0);
    return n(same) + n(above) + n(below);
  }, [same, above, below]);

  async function submit() {
    setErr(null);
    const num = (x: string) => (x === "" ? null : Number(x));
    const sameN = num(same);
    if (sameN == null || Number.isNaN(sameN) || sameN < 0 || sameN > 100) {
      return setErr("「與你同等第」的比例必填，且需介於 0–100。");
    }
    setSaving(true);
    try {
      const r = await fetch("/api/grade-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseName,
          teacher,
          semester,
          pivot,
          samePct: sameN,
          abovePct: num(above),
          belowPct: num(below),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error?.message ?? "儲存失敗");
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">回報我的成績</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          title="關閉"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">修課學期</span>
          <Select value={semester} onChange={(e) => setSemester(e.target.value)}>
            {SEMESTER_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
                {myReports[s] ? "（已回報）" : ""}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">你的等第</span>
          <Select value={pivot} onChange={(e) => setPivot(e.target.value)}>
            {GRADE_ORDER.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </label>
        {editing && <span className="text-xs text-muted-foreground">編輯我這學期的回報</span>}
      </div>

      <p className="text-xs text-muted-foreground">
        填入查成績時系統顯示的三個比例（與你同等第為必填；填了以上/以下才能定位中間區段）：
      </p>
      <div className="grid grid-cols-3 gap-2">
        <PctField label="與你同等第" value={same} onChange={setSame} required />
        <PctField label="高於你" value={above} onChange={setAbove} />
        <PctField label="低於你" value={below} onChange={setBelow} />
      </div>
      <p className="text-xs text-muted-foreground">
        三者合計{" "}
        <span className={Math.abs(sum - 100) <= 1 ? "text-emerald-600" : "text-[hsl(var(--warning))]"}>
          {sum.toFixed(1)}%
        </span>
        {Math.abs(sum - 100) > 1 && "（理想為 100%，但僅填同等第也可以）"}
      </p>

      {err && <p className="text-sm text-[hsl(var(--warning))]">{err}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>
          取消
        </Button>
        <Button size="sm" onClick={submit} disabled={saving || same === ""}>
          {saving ? "儲存中…" : editing ? "更新" : "送出"}
        </Button>
      </div>
    </div>
  );
}

function PctField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">
        {label}
        {required && <span className="text-[hsl(var(--warning))]"> *</span>}
      </span>
      <Input
        type="number"
        min={0}
        max={100}
        step="0.01"
        inputMode="decimal"
        placeholder="%"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8"
      />
    </label>
  );
}

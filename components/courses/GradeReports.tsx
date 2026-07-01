"use client";

// 成績分布 A 版 — distribution reconstructed from RELATIVE reports (plus the
// converted imported data). Each student only knows three numbers relative to
// their own grade (同等/以上/以下); we collect those and reconstruct: every
// reported grade is a solid bar; still-unknown mass shows as 未細分/不確定 bands
// that shrink as more people report.

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
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

// 分組配色：A 綠、B 黃、C 紅、F 灰。每組三個等第（+ / 無 / -）由深到淺排列。
// 一律用完整字串（Tailwind JIT 不會偵測拼接出來的 class）。
const GRADE_BAR: Record<string, [string, string, string]> = {
  A: ["bg-emerald-500/95", "bg-emerald-300/90", "bg-emerald-200/85"],
  B: ["bg-yellow-500/95", "bg-yellow-300/90", "bg-yellow-200/85"],
  C: ["bg-red-500/95", "bg-red-300/90", "bg-red-200/85"],
  F: ["bg-gray-500/95", "bg-gray-300/90", "bg-gray-200/85"],
};
const GRADE_DOT: Record<string, [string, string, string]> = {
  A: ["bg-emerald-500", "bg-emerald-300", "bg-emerald-200"],
  B: ["bg-yellow-500", "bg-yellow-300", "bg-yellow-200"],
  C: ["bg-red-500", "bg-red-300", "bg-red-200"],
  F: ["bg-gray-500", "bg-gray-300", "bg-gray-200"],
};
// 等第在其分組中的位置：+ 用最鮮明飽和的正色(0)，讓 A+ 最突出；無號(1)與 -(2)
// 逐級轉為乾淨的淺色。陣列排序為 [鮮明, 淺, 更淺]。
function tierIndex(label: string): number {
  if (label.endsWith("+")) return 0;
  if (label.endsWith("-")) return 2;
  return 1;
}

// Colour a segment: grey stripes for an unknown lump (未細分/不確定), else by
// grade tier.
function segClass(seg: Segment): string {
  if (!seg.known)
    return "bg-[repeating-linear-gradient(45deg,hsl(var(--muted-foreground)/0.18)_0_6px,hsl(var(--muted-foreground)/0.06)_6px_12px)]";
  return (GRADE_BAR[seg.label[0]] ?? GRADE_BAR.F)[tierIndex(seg.label)];
}
function dotClass(seg: Segment): string {
  if (!seg.known) return "bg-muted-foreground/30";
  return (GRADE_DOT[seg.label[0]] ?? GRADE_DOT.F)[tierIndex(seg.label)];
}

export function GradeReports({
  courseName,
  teacher,
  loggedIn,
  onCount,
  form,
  setForm,
}: {
  courseName: string;
  teacher: string | null;
  loggedIn: boolean;
  onCount: (n: number) => void;
  // 表單開關狀態上移到 CourseInfo，讓「回報我的成績」按鈕能放到頁籤列右上角。
  form: { initial?: string } | null;
  setForm: Dispatch<SetStateAction<{ initial?: string } | null>>;
}) {
  const [semesters, setSemesters] = useState<SemesterDist[]>([]);
  const [myReports, setMyReports] = useState<Record<string, MyReport>>({});
  const [loading, setLoading] = useState(true);

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
      {/* 觸發按鈕在 CourseInfo 頁籤列；表單面板／未登入提示放最上面，和「新增評論」一致。 */}
      {loggedIn && form && (
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
      )}
      {!loggedIn && (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          <Link href="/login" className="font-medium text-foreground underline">
            登入
          </Link>{" "}
          後即可回報你看到的成績比例，一起還原分布。
        </p>
      )}

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
                {/* 只有使用者回報過的學期才顯示編輯圖標；沒填過的一律不顯示。 */}
                {loggedIn && myReports[s.semester] && (
                  <button
                    type="button"
                    onClick={() => setForm({ initial: s.semester })}
                    aria-label="編輯這學期的回報"
                    title="編輯我的回報"
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
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-muted-foreground">
                {s.segments.map((seg, i) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <span className={"inline-block h-2.5 w-2.5 rounded-sm " + dotClass(seg)} />
                    <span className={seg.known ? "text-foreground" : ""}>{seg.label}</span>
                    <span className="tabular-nums">{seg.pct.toFixed(1)}%</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
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

  async function submit() {
    setErr(null);
    const num = (x: string) => (x === "" ? null : Number(x));
    const sameN = num(same);
    if (sameN == null || Number.isNaN(sameN) || sameN < 0 || sameN > 100) {
      return setErr("「與您成績相同的比例」為必填。");
    }
    // 只填中間一格時不必湊 100；填了兩格以上才要求加總為 100。
    const filledCount = [below, same, above].filter((x) => x !== "").length;
    if (filledCount >= 2) {
      const total = (Number(below) || 0) + sameN + (Number(above) || 0);
      if (Math.abs(total - 100) > 0.1) {
        return setErr("三個比例加起來需等於 100%。");
      }
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

  async function remove() {
    if (!window.confirm("確定要刪除這學期的回報嗎？")) return;
    setErr(null);
    setSaving(true);
    try {
      const r = await fetch("/api/grade-reports", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseName, teacher, semester }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        throw new Error(j?.error?.message ?? "刪除失敗");
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-5">
      <div className="flex items-start justify-between gap-2">
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
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉"
          title="關閉"
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>

      <span className="block text-sm font-medium">請填入 epo 系統顯示的三個比例：</span>

      <div className="flex flex-wrap items-end gap-6">
        <PctField label="比您成績低的比例（選填）" value={below} onChange={setBelow} />
        <PctField label="與您成績相同的比例（必填）" value={same} onChange={setSame} required />
        <PctField label="比您成績高的比例（選填）" value={above} onChange={setAbove} />
        {/* 按鈕與其上方的橘紅提示小字一起靠右下角。 */}
        <div className="ml-auto flex flex-col items-end gap-1">
          {err && <p className="text-sm text-[hsl(var(--warning))]">{err}</p>}
          <div className="flex gap-2">
            {editing && (
              <Button
                size="sm"
                variant="outline"
                onClick={remove}
                disabled={saving}
                className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                刪除
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving ? "儲存中…" : editing ? "更新" : "送出"}
            </Button>
          </div>
        </div>
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
    <label className="flex w-44 flex-col gap-1 whitespace-nowrap text-xs">
      <span className="text-muted-foreground">
        {label}
        {required && <span className="text-[hsl(var(--warning))]"> *</span>}
      </span>
      <div className="relative">
        <Input
          type="number"
          min={0}
          max={100}
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          // pr-7 leaves room for the fixed %；隱藏數字上下三角按鍵（webkit + firefox）。
          className="h-8 w-full pr-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          %
        </span>
      </div>
    </label>
  );
}

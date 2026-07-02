"use client";

// 成績分布 A 版 — distribution reconstructed from RELATIVE reports (plus the
// converted imported data). Each student only knows three numbers relative to
// their own grade (同等/以上/以下); we collect those and reconstruct: every
// reported grade is a solid bar; still-unknown mass shows as 未細分/不確定 bands
// that shrink as more people report.

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/input";
import { SEMESTER_OPTIONS } from "@/lib/reviews/key";
import { GRADE_ORDER, type Segment, type Bar } from "@/lib/grades/reports";

interface SemesterDist {
  semester: string;
  bars: Bar[];
  reportCount: number;
  hasLegacy: boolean;
}
export interface MyReport {
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
  // F 只有單一等第（用中間色階），用中灰以免與淺灰的「無資料」條紋混淆。
  F: ["bg-gray-600/95", "bg-gray-500/90", "bg-gray-400/85"],
};
// 等第在其分組中的位置：+ 用最鮮明飽和的正色(0)，讓 A+ 最突出；無號(1)與 -(2)
// 逐級轉為乾淨的淺色。陣列排序為 [鮮明, 淺, 更淺]。
function tierIndex(label: string): number {
  if (label.endsWith("+")) return 0;
  if (label.endsWith("-")) return 2;
  return 1;
}

// A segment is one of two kinds now:
//   · known grade            → tier colour, grade + % written INSIDE the box.
//   · 更高/更低/中間 (未細分) → neutral grey box with "?" + % inside, like a grade.
/** Box fill colour. */
function segFill(seg: Segment): string {
  if (seg.known) return (GRADE_BAR[seg.label[0]] ?? GRADE_BAR.F)[tierIndex(seg.label)];
  return "bg-gray-200";
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

  // 系統已經有資料的等第（每學期）：分布圖中所有 known 區塊的等第。回報時這些等第
  // 不能再填（已知該等第比例，重複回報沒意義）。memo 以維持 prop identity 穩定。
  const takenGrades = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const s of semesters) {
      const set = new Set<string>();
      for (const bar of s.bars)
        for (const seg of bar.segments) if (seg.known) set.add(seg.label);
      map[s.semester] = [...set];
    }
    return map;
  }, [semesters]);

  return (
    <div className="space-y-4">
      {/* 觸發按鈕在 CourseInfo 頁籤列；表單面板／未登入提示放最上面，和「新增評論」一致。 */}
      {loggedIn && form && (
        <ReportForm
          courseName={courseName}
          teacher={teacher}
          initialSemester={form.initial}
          myReports={myReports}
          takenGrades={takenGrades}
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
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{s.semester}</span>
              </div>

              {/* 每個一致的回報群組一條 bar（衝突 → 多條上下排列）。等第＋% 並排寫在
                  框內。每格有最小寬度確保文字完整；當多個小比例撐到最小寬度、空間
                  不夠時，較大的比例會等比例壓縮讓出空間（不使用捲動）。 */}
              <div className="space-y-1">
                {s.bars.map((bar, bi) => (
                  <div key={bi} className="flex h-9 w-full gap-px overflow-hidden rounded bg-muted sm:h-8">
                    {bar.segments.map((seg, i) => (
                      <div
                        key={i}
                        style={{ flexBasis: `${seg.pct}%` }}
                        // 電腦版用滑鼠 hover 由 title 顯示完整比例（手機不需要）。
                        title={`${seg.label} ${seg.pct.toFixed(1)}%`}
                        className={
                          "flex min-w-[1.2rem] items-center justify-center overflow-hidden px-1 leading-none sm:min-w-[1.5rem] " +
                          segFill(seg)
                        }
                      >
                        {/* 手機版：比例在等第下方（省寬度）；電腦版：比例在等第右邊。 */}
                        <span
                          className={
                            "flex flex-col items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold sm:flex-row sm:gap-1 " +
                            (seg.known ? "text-gray-900" : "text-gray-500")
                          }
                        >
                          <span>{seg.known ? seg.label : "?"}</span>
                          {/* 電腦版：格子太小（比例<5%）只顯示等第，% 藏起來，滑鼠 hover
                              由 title 顯示完整比例。手機版直向堆疊有空間，照常顯示。 */}
                          <span
                            className={
                              "tabular-nums" + (seg.pct < 5 ? " sm:hidden" : "")
                            }
                          >
                            {/* 10% 以上顯示到小數點後一位；未滿 10% 取整數。 */}
                            {seg.pct.toFixed(seg.pct >= 10 ? 1 : 0)}%
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
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
export function ReportForm({
  courseName,
  teacher,
  initialSemester,
  myReports,
  takenGrades,
  onClose,
  onSaved,
  inline = false,
}: {
  courseName: string;
  teacher: string | null;
  initialSemester?: string;
  myReports: Record<string, MyReport>;
  /** 每學期系統已有資料的等第 → 不能重複回報。缺省時不限制（例如編輯既有回報）。 */
  takenGrades?: Record<string, string[]>;
  onClose: () => void;
  onSaved: () => void;
  // inline=true：不用彈出視窗，直接在原位展開表單（用於「我的評論」成績分布頁）。
  inline?: boolean;
}) {
  // 一人一課只留一筆。載入使用者現有的那筆（不分學期），編輯時可改學期而不清空
  // 已填的等第與比例——換學期只是把這筆「移到」另一個學期。
  const existing = Object.entries(myReports)[0]; // [semester, MyReport] | undefined
  const mine = existing?.[1];
  const initialSem = initialSemester ?? existing?.[0] ?? SEMESTER_OPTIONS[0];
  const [semester, setSemester] = useState(initialSem);
  const [pivot, setPivot] = useState(() => {
    if (mine?.pivot) return mine.pivot;
    // 預設挑第一個「系統還沒有資料」的等第，避免一開啟就選到不能填的等第。
    const taken = new Set(takenGrades?.[initialSem] ?? []);
    return GRADE_ORDER.find((g) => !taken.has(g)) ?? GRADE_ORDER[0];
  });
  const [same, setSame] = useState(mine?.samePct != null ? String(mine.samePct) : "");
  const [above, setAbove] = useState(mine?.abovePct != null ? String(mine.abovePct) : "");
  const [below, setBelow] = useState(mine?.belowPct != null ? String(mine.belowPct) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const editing = !!mine;
  // 此學期系統已占用（已有資料）的等第 → 不能重複回報。排除自己這學期的既有回報
  // （那筆本來就是你自己的，可以繼續選、編輯）。
  const ownPivotHere = existing?.[0] === semester ? mine?.pivot : undefined;
  const disabledGrades = new Set(
    (takenGrades?.[semester] ?? []).filter((g) => g !== ownPivotHere),
  );
  // A+ has nothing above it; F has nothing below it — lock (and clear) those.
  const aboveLocked = pivot === "A+";
  const belowLocked = pivot === "F";
  useEffect(() => {
    if (aboveLocked) setAbove("");
    if (belowLocked) setBelow("");
  }, [aboveLocked, belowLocked]);

  async function submit(force = false) {
    setErr(null);
    // 系統已有該等第的資料 → 不能重複回報。
    if (disabledGrades.has(pivot)) {
      return setErr(`${semester} 的 ${pivot} 已經有資料了，不能重複回報。`);
    }
    const num = (x: string) => (x === "" ? null : Number(x));
    // 以上/以下改為必填（A+ 無以上、F 無以下除外）。
    const sameN = num(same);
    const aboveN = aboveLocked ? 0 : num(above);
    const belowN = belowLocked ? 0 : num(below);
    const sameBad = sameN == null || Number.isNaN(sameN) || sameN < 0 || sameN > 100;
    if (sameBad || (!aboveLocked && aboveN == null) || (!belowLocked && belowN == null)) {
      return setErr("三個比例都要填。");
    }
    // 三者（扣掉不適用的邊界）需加總為 100%。
    const total = sameN + (aboveN ?? 0) + (belowN ?? 0);
    if (Math.abs(total - 100) > 0.1) {
      return setErr("三個比例加起來需等於 100%。");
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
          abovePct: aboveLocked ? null : num(above),
          belowPct: belowLocked ? null : num(below),
          force,
        }),
      });
      const j = await r.json().catch(() => null);
      // 與其他人的資料衝突：先詢問使用者，確認後帶 force 重送（兩者都會保留）。
      if (r.ok && j?.conflict && !force) {
        setSaving(false);
        if (window.confirm("你填的資料與系統現有資料衝突，確定要送出嗎？")) {
          return submit(true);
        }
        return;
      }
      if (!r.ok) throw new Error(j?.error?.message ?? "儲存失敗");
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

  const title = editing ? "編輯成績回報" : "回報成績";
  const gradeSelect = (
    <label className="flex items-center gap-2">
      <span className="text-muted-foreground">你的等第</span>
      <Select value={pivot} onChange={(e) => setPivot(e.target.value)}>
        {GRADE_ORDER.map((g) => (
          // 系統已有資料的等第停用，不能重複回報。
          <option key={g} value={g} disabled={disabledGrades.has(g)}>
            {g}
            {disabledGrades.has(g) ? "（已有資料）" : ""}
          </option>
        ))}
      </Select>
    </label>
  );
  const body = (
      <div className="space-y-4">
      {inline ? (
        // 原位編輯：課名＋教師＋學期做標題（學期固定），等第沿用下拉選單，設計與「我的評論」評價編輯一致。
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="font-medium">{courseName}</span>
          {teacher && <span className="text-xs text-muted-foreground">{teacher}</span>}
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{semester}</span>
          {gradeSelect}
        </div>
      ) : (
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
          {gradeSelect}
          {editing && <span className="text-xs text-muted-foreground">編輯我這學期的回報</span>}
        </div>
      )}

      <span className="block text-sm font-medium">請填入 epo 系統顯示的三個比例：</span>

      {/* 手機版：三格縮短並排同一列（grid 三欄）；電腦版維持較寬的排列。 */}
      <div className="grid grid-cols-3 items-end gap-2 sm:flex sm:flex-wrap sm:gap-6">
        <PctField
          label={belowLocked ? "比您成績低的（F 最低）" : "比您成績低的"}
          value={belowLocked ? "" : below}
          onChange={setBelow}
          disabled={belowLocked}
        />
        <PctField label="與您成績相同的" value={same} onChange={setSame} />
        <PctField
          label={aboveLocked ? "比您成績高的（A+ 最高）" : "比您成績高的"}
          value={aboveLocked ? "" : above}
          onChange={setAbove}
          disabled={aboveLocked}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {err && <p className="w-full text-sm text-[hsl(var(--warning))]">{err}</p>}
        {/* 原位編輯（inline）只保留 取消／儲存；彈窗模式仍提供刪除。 */}
        {editing && !inline && (
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
        <Button size="sm" onClick={() => submit()} disabled={saving}>
          {saving ? "儲存中…" : inline ? "儲存" : editing ? "更新" : "送出"}
        </Button>
      </div>
      </div>
  );

  // 原位展開：直接套用卡片外框，設計與「我的評論」評價編輯一致（課名做標題、無彈窗）。
  if (inline) {
    return <div className="rounded-lg border border-border bg-card p-4">{body}</div>;
  }

  return (
    <Modal open onClose={onClose} title={title}>
      {body}
    </Modal>
  );
}

function PctField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className={"flex w-full flex-col gap-1 text-xs sm:w-44 sm:whitespace-nowrap" + (disabled ? " opacity-50" : "")}>
      <span className="text-muted-foreground">{label}</span>
      <div className="relative">
        <Input
          type="number"
          min={0}
          max={100}
          step="0.01"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={disabled ? "—" : undefined}
          // pr-7 leaves room for the fixed %；隱藏數字上下三角按鍵（webkit + firefox）。
          className="h-8 w-full pr-7 [appearance:textfield] disabled:cursor-not-allowed [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
          %
        </span>
      </div>
    </label>
  );
}

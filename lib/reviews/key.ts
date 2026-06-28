// Course-identity key for reviews + grade distributions.
//
// Reviews and grade distributions are HISTORICAL (any past semester), but our
// `courses` table only holds the current 115-1 courses. So both are keyed by a
// normalised "course identity" = (course_name, teacher) — NOT a 115-1 course id.
// A course card looks up its reviews/grades by computing the same key from its
// own name + teacher. This also realises the "課名＋教師完全對上才歸類" rule.
//
// NOTE: scripts/import-grade-distributions.mjs keeps an inline copy of these —
// keep the two in sync.

/** Collapse whitespace runs to a single space + trim. */
export function normName(name: string): string {
  return name.replace(/[\s　]+/g, " ").trim();
}

/** Teacher: strip a trailing 班次 in parens (e.g. "羅聖堡(28)") + remove all whitespace. */
export function normTeacher(teacher: string | null | undefined): string {
  if (!teacher) return "";
  return teacher
    .replace(/[（(]\s*\d+\s*[)）]\s*$/, "") // trailing (班次)
    .replace(/[\s　]+/g, "")
    .trim();
}

/** "課名|教師" identity key. */
export function matchKey(name: string, teacher: string | null | undefined): string {
  return `${normName(name)}|${normTeacher(teacher)}`;
}

/** Normalise a semester to canonical "XXX-Y". Accepts "1131" and "113-1". null if bad. */
export function normSemester(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (/^\d{3}-[12]$/.test(t)) return t;
  if (/^\d{4}$/.test(t) && (t[3] === "1" || t[3] === "2")) return `${t.slice(0, 3)}-${t[3]}`;
  return null;
}

/** Recent semesters for the picker (newest first). Through current 115-2. */
export const SEMESTER_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let year = 115; year >= 108; year--) {
    out.push(`${year}-2`, `${year}-1`);
  }
  return out;
})();

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

// 115 學期尚未開始，所以評論/成績分布的學期最晚只到 114-2。
export const MAX_SEMESTER = "114-2";

/** Normalise a semester to canonical "XXX-Y". Accepts "1131" and "113-1".
 *  Returns null for bad input OR for semesters later than MAX_SEMESTER. */
export function normSemester(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  let canon: string | null = null;
  if (/^\d{3}-[12]$/.test(t)) canon = t;
  else if (/^\d{4}$/.test(t) && (t[3] === "1" || t[3] === "2")) canon = `${t.slice(0, 3)}-${t[3]}`;
  if (!canon || canon > MAX_SEMESTER) return null; // fixed-width → lexical compare is safe
  return canon;
}

/** Selectable semesters (newest first), capped at MAX_SEMESTER down to 108-1. */
export const SEMESTER_OPTIONS: string[] = (() => {
  const [maxYear, maxTerm] = MAX_SEMESTER.split("-").map(Number);
  const out: string[] = [];
  for (let year = maxYear; year >= 108; year--) {
    for (const term of [2, 1]) {
      if (year === maxYear && term > maxTerm) continue;
      out.push(`${year}-${term}`);
    }
  }
  return out;
})();

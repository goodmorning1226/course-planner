// Course-classification normalize / parse / display helpers.
//
// IMPORTANT: these only NORMALIZE text that came from an official or historical
// course source — they never *guess* a classification from a course name. When
// the input is missing or unrecognised, they return "unknown" (尚未分類) rather
// than inventing a category. GE areas / 必選修 must come from real data.

import type {
  Confidence,
  CourseTypeNormalized,
  RequirementNormalized,
} from "./types";

// --- Course網 categories (multi; a course can be in several) -----------------

export const COURSE_CATEGORIES: { slug: string; label: string }[] = [
  { slug: "dept", label: "系所" },
  { slug: "general", label: "通識/溝通" },
  { slug: "common", label: "共同/新生" },
  { slug: "pearmy", label: "體育/國防" },
  { slug: "program", label: "學程" },
  { slug: "expertise", label: "領域專長" },
  { slug: "interschool", label: "校際" },
  { slug: "english", label: "進階英語" },
  // 未分類: courses we can't confirm a category for (and aren't a known rename).
  { slug: "uncategorized", label: "未分類" },
];

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  COURSE_CATEGORIES.map((c) => [c.slug, c.label])
);

// --- General-education areas (A1–A8) ----------------------------------------

export const GE_AREA_LABELS: Record<string, string> = {
  A1: "文學與藝術",
  A2: "歷史思維",
  A3: "世界文明與全球化",
  A4: "哲學與道德思考",
  A5: "公民意識與社會分析",
  A6: "數學與資訊科學",
  A7: "物質科學",
  A8: "生命科學",
};

/** Extract GE area codes (A1–A8) from raw official text. [] if none. */
export function parseGeneralEducationCategories(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const found = new Set<string>();
  for (const m of raw.toUpperCase().matchAll(/A[1-8]/g)) found.add(m[0]);
  return [...found].sort();
}

/** GE area labels for the codes found in raw text. */
export function parseGeneralEducationLabels(raw: string | null | undefined): string[] {
  return parseGeneralEducationCategories(raw)
    .map((c) => GE_AREA_LABELS[c])
    .filter(Boolean);
}

/**
 * Is this a GE course? Only true when the raw text explicitly says 通識 or names
 * a GE area (A1–A8). Never inferred from the course name alone.
 */
export function isGeneralEducationCourse(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return raw.includes("通識") || parseGeneralEducationCategories(raw).length > 0;
}

// --- Course-type normalization ----------------------------------------------

/** Normalize an official 課程類別 string. Unknown / unrecognised → "unknown". */
export function normalizeCourseType(raw: string | null | undefined): CourseTypeNormalized {
  if (!raw) return "unknown";
  const s = raw.trim();
  if (s.includes("共同必修")) return "common_required";
  if (s.includes("共同選修")) return "common_elective";
  if (isGeneralEducationCourse(s)) return "general_education";
  if (s.includes("全民國防") || s.includes("軍訓")) return "military";
  if (s.includes("新生專題")) return "freshman_seminar";
  if (s.includes("新生講座")) return "freshman_lecture";
  if (s.includes("寫作")) return "writing";
  if (s.includes("溝通表達") || s.includes("職涯")) return "career_communication";
  if (s.includes("校際") || s.includes("跨校")) return "intercollegiate";
  if (s.includes("全校")) return "university_wide";
  if (s.includes("院共同") || s.includes("學院課程")) return "college_departmental";
  if (s.includes("系") || s.includes("所") || s.includes("學程") || s.includes("院"))
    return "departmental";
  return "unknown";
}

// --- Requirement normalization ----------------------------------------------

/** Normalize an official 必/選修 string. Unknown / unrecognised → "unknown". */
export function normalizeRequirement(raw: string | null | undefined): RequirementNormalized {
  if (!raw) return "unknown";
  const s = raw.trim();
  if (s.includes("共同必修")) return "common_required";
  if (s.includes("共同選修")) return "common_elective";
  if (s.includes("院必修")) return "college_required";
  if (s.includes("院選修")) return "college_elective";
  if (s.includes("必選修")) return "required_elective";
  if (s.includes("選擇必修") || s.includes("限選")) return "optional_required";
  if (s.includes("必修")) return "required";
  if (s.includes("選修")) return "elective";
  return "unknown";
}

// --- Display names (conservative, zh-Hant) ----------------------------------

const COURSE_TYPE_NAMES: Record<CourseTypeNormalized, string> = {
  common_required: "共同必修",
  common_elective: "共同選修",
  general_education: "通識",
  departmental: "院系所課程",
  college_departmental: "學院課程",
  university_wide: "其他全校性課程",
  military: "全民國防 / 軍訓",
  freshman_seminar: "新生專題",
  freshman_lecture: "新生講座",
  writing: "寫作教學",
  career_communication: "溝通表達與職涯發展",
  intercollegiate: "跨校課程",
  unknown: "尚未分類",
};

const REQUIREMENT_NAMES: Record<RequirementNormalized, string> = {
  required: "必修",
  elective: "選修",
  required_elective: "必選修",
  optional_required: "選擇必修",
  college_required: "院必修",
  college_elective: "院選修",
  common_required: "共同必修",
  common_elective: "共同選修",
  unknown: "未知",
};

export function getCourseTypeDisplayName(type: CourseTypeNormalized): string {
  return COURSE_TYPE_NAMES[type] ?? "尚未分類";
}

export function getRequirementDisplayName(type: RequirementNormalized): string {
  return REQUIREMENT_NAMES[type] ?? "未知";
}

export function getConfidenceDisplayName(confidence: string): string {
  switch (confidence as Confidence) {
    case "high":
      return "可信度高";
    case "medium":
      return "可信度中";
    case "low":
      return "可信度低";
    default:
      return "未知";
  }
}

export function getSourceDisplayName(source: string): string {
  switch (source) {
    case "official_1151":
      return "官方課程資料";
    case "historical_match":
      return "依歷史資料推估";
    case "course_code_inference":
      return "依課號推估";
    default:
      return "尚未分類";
  }
}

/** True for sources that are NOT the official current-semester catalog. */
export function isEstimatedSource(source: string): boolean {
  return source === "historical_match" || source === "course_code_inference";
}

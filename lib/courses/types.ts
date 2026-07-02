// Shared domain types for course-planner.
// Field names mirror the Supabase columns (snake_case) so query rows map
// directly onto these types. See supabase/01_schema.sql.

/**
 * NTU period codes. Supports 0–10 plus the evening blocks A–D.
 * Stored in the DB as text[] so numeric and letter codes coexist.
 */
export type PeriodCode =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "A"
  | "B"
  | "C"
  | "D";

/** Day of week, 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * A course header — one row of the `courses` table. Time/room details live in
 * `CourseSession` rows linked by course_id.
 */
export interface Course {
  id: string;
  /** 學期, e.g. "115-1". */
  semester: string;
  /** 流水號 / 來源 PK. */
  pk: string | null;
  /** 建物 / 學院. */
  building_or_college: string | null;
  /** 課名. */
  course_name: string;
  /** 班次. */
  class_group: string | null;
  /** 教師. */
  teacher: string | null;
  /** 資料來源 URL. */
  source_url: string | null;
  /** 爬取時間 (ISO string). */
  scraped_at: string;
  /** 校際課程：開放台大名額 / 已選台大人數 (null = 一般台大課程). */
  interschool_quota?: number | null;
  interschool_taken?: number | null;
  /** 'active' | 'removed'(停開). Soft-delete: a course that vanished from source
   *  is flagged 'removed' (shown struck-through), never hard-deleted. */
  status?: "active" | "removed";
  /** 停開時間 (ISO string) — null while active. */
  removed_at?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A single meeting time/room of a course — one row of `course_sessions`.
 * A course may have several sessions.
 */
export interface CourseSession {
  id: string;
  course_id: string;
  /** 星期 1–7. */
  weekday: Weekday | null;
  /** 教室. */
  classroom: string | null;
  /** 原始上課時間, e.g. "10:20-12:10". */
  raw_time_text: string | null;
  /** 轉換後節次, e.g. ["3", "4"]. */
  periods: PeriodCode[];
  /** 起 (e.g. "10:20:00") — optional. */
  start_time: string | null;
  /** 迄 — optional. */
  end_time: string | null;
  created_at: string;
}

/** A course together with all of its sessions — the shape used by the UI. */
export interface CourseWithSessions extends Course {
  sessions: CourseSession[];
  /** 學分 — denormalised from course_metadata for convenient totals. */
  credits?: number | null;
}

// --- Classification / metadata enrichment -----------------------------------

export type CourseTypeNormalized =
  | "common_required"
  | "common_elective"
  | "general_education"
  | "departmental"
  | "college_departmental"
  | "university_wide"
  | "military"
  | "freshman_seminar"
  | "freshman_lecture"
  | "writing"
  | "career_communication"
  | "intercollegiate"
  | "unknown";

export type RequirementNormalized =
  | "required"
  | "elective"
  | "required_elective"
  | "optional_required"
  | "college_required"
  | "college_elective"
  | "common_required"
  | "common_elective"
  | "unknown";

export type Confidence = "high" | "medium" | "low" | "unknown";

/** The course's OWN classification (通識/共同/院系所…). One per course. */
export interface CourseMetadata {
  id: string;
  course_id: string;
  official_semester: string | null;
  official_course_code: string | null;
  official_course_identifier: string | null;
  credits: number | null;
  course_type_raw: string | null;
  course_type_normalized: CourseTypeNormalized;
  /** 課程網分類 slugs (multi): dept/general/common/pearmy/program/… */
  categories: string[];
  /** 開課系所代碼 (courseTargets.department.id), 可多個 */
  dept_codes: string[];
  /** 系所年級 buckets: "<deptCode>:<gradeId>" tokens */
  dept_grades: string[];
  is_general_education: boolean;
  ge_categories: string[];
  ge_labels: string[];
  ge_creditable: boolean | null;
  // Internal classification certainty — NEVER sent to the client. confidence is
  // the 確定/不確定 tag (medium/high = 確定 found exact data; low = 不確定).
  // The public /api/courses response redacts these (admin reads the DB direct).
  source?: string;
  confidence?: Confidence;
  matched_semester: string | null;
  matched_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Required/elective status relative to a target department/college. */
export interface CourseRequirement {
  id: string;
  course_id: string;
  target_department_name: string | null;
  target_department_code: string | null;
  target_college_name: string | null;
  audience_raw: string | null;
  requirement_raw: string | null;
  requirement_normalized: RequirementNormalized;
  source: string;
  confidence: Confidence;
  matched_semester: string | null;
  created_at: string;
  updated_at: string;
}

/** Full course shape for the UI: sessions + classification. */
export interface CourseWithSessionsAndMetadata extends CourseWithSessions {
  metadata: CourseMetadata | null;
  requirements: CourseRequirement[];
}

/** A membership row of `timetable_courses` — a course inside a timetable. */
export interface TimetableCourse {
  id: string;
  timetable_id: string;
  course_id: string;
  created_at: string;
}

// --- 修課情報：課程評價 + 成績分布 -------------------------------------------

/** A user's review of a course (identity = course_name + teacher). */
export interface CourseReview {
  id: string;
  course_name: string;
  teacher: string | null;
  semester: string;
  rating_overall: number; // 總體 0.5..5 (half steps)
  rating_sweet: number | null;   // 甜度（選填）
  rating_chill: number | null;   // 涼度（選填）
  rating_solid: number;   // 扎實
  comment: string | null;
  like_count: number;
  report_count: number;
  created_at: string;
  updated_at: string;
  /** Whether the current viewer liked this (filled by the API when logged in). */
  liked?: boolean;
  /** Whether the current viewer owns this review. */
  mine?: boolean;
}

/** Average ratings + count across all reviews of a course. */
export interface ReviewAggregate {
  count: number;
  overall: number | null;
  sweet: number | null;
  chill: number | null;
  solid: number | null;
}

/** Grade distribution (percentages per bucket) for a course in one semester. */
export interface GradeDistribution {
  id: string;
  course_name: string;
  teacher: string | null;
  semester: string;
  a_plus: number | null; a: number | null; a_minus: number | null;
  b_plus: number | null; b: number | null; b_minus: number | null;
  c_plus: number | null; c: number | null; c_minus: number | null;
  f: number | null;
  note: string | null;
  source: string | null;
}

/** The 10 grade buckets, in display order, with their column keys. */
export const GRADE_BUCKETS: { key: keyof GradeDistribution; label: string }[] = [
  { key: "a_plus", label: "A+" }, { key: "a", label: "A" }, { key: "a_minus", label: "A-" },
  { key: "b_plus", label: "B+" }, { key: "b", label: "B" }, { key: "b_minus", label: "B-" },
  { key: "c_plus", label: "C+" }, { key: "c", label: "C" }, { key: "c_minus", label: "C-" },
  { key: "f", label: "F" },
];

/** Filters accepted by the course search endpoint. */
export interface CourseSearchFilters {
  q?: string;
  weekday?: Weekday;
  period?: PeriodCode;
  building_or_college?: string;
  classroom?: string;
  teacher?: string;
}

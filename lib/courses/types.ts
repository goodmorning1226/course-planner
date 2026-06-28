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

/** Filters accepted by the course search endpoint. */
export interface CourseSearchFilters {
  q?: string;
  weekday?: Weekday;
  period?: PeriodCode;
  building_or_college?: string;
  classroom?: string;
  teacher?: string;
}

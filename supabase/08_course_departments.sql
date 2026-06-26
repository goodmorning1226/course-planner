-- =============================================================================
-- 08_course_departments.sql — per-course offering departments + grade buckets
--
-- ADDITIVE. The 系所 大類 lets users pick one or many departments, and (when a
-- single department is chosen) a department-specific 年級 bucket. We therefore
-- store, per course:
--   dept_codes   text[]  — offering department codes (courseTargets.department.id)
--   dept_grades  text[]  — "<deptCode>:<gradeId>" tokens, mirroring course網's
--                          per-(department, suggestedGrade) segmentation.
-- Both are array-contains / overlaps filtered, so GIN indexes.
-- =============================================================================

alter table public.course_metadata
  add column if not exists dept_codes text[] not null default '{}';

alter table public.course_metadata
  add column if not exists dept_grades text[] not null default '{}';

create index if not exists idx_course_metadata_dept_codes
  on public.course_metadata using gin (dept_codes);

create index if not exists idx_course_metadata_dept_grades
  on public.course_metadata using gin (dept_grades);

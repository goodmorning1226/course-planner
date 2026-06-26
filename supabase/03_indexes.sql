-- =============================================================================
-- 03_indexes.sql — indexes to support search & filtering
-- =============================================================================

-- Trigram support for substring / fuzzy search on text columns. pg_trgm is
-- available on Supabase and keeps course-name search simple and reliable
-- (ILIKE '%query%' uses the GIN trigram index).
create extension if not exists "pg_trgm";

-- --- courses -----------------------------------------------------------------
create index if not exists idx_courses_semester
  on public.courses (semester);
create index if not exists idx_courses_pk
  on public.courses (pk);
create index if not exists idx_courses_building
  on public.courses (building_or_college);

-- Trigram indexes for fuzzy name / teacher search.
create index if not exists idx_courses_name_trgm
  on public.courses using gin (course_name gin_trgm_ops);
create index if not exists idx_courses_teacher_trgm
  on public.courses using gin (teacher gin_trgm_ops);

-- --- course_sessions ---------------------------------------------------------
create index if not exists idx_sessions_weekday
  on public.course_sessions (weekday);
create index if not exists idx_sessions_classroom
  on public.course_sessions (classroom);
create index if not exists idx_sessions_course
  on public.course_sessions (course_id);
-- Filter by period (text[]): GIN supports the `periods @> '{3}'` containment.
create index if not exists idx_sessions_periods
  on public.course_sessions using gin (periods);

-- --- timetable_courses -------------------------------------------------------
create index if not exists idx_timetable_courses_timetable
  on public.timetable_courses (timetable_id);
create index if not exists idx_timetable_courses_course
  on public.timetable_courses (course_id);

-- --- user_timetables ---------------------------------------------------------
create index if not exists idx_user_timetables_user
  on public.user_timetables (user_id);

-- course_metadata / course_requirements indexes live in 05_course_metadata.sql
-- (also folded into 00_full_setup.sql).

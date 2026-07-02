-- =============================================================================
-- 20_course_info_count.sql — denormalised 修課情報 count for browse ordering.
--
-- When the user browses WITHOUT a text search, courses with more 修課情報
-- (評論 + 成績分布學期數) surface first. 情報 is keyed by course identity
-- (name|teacher), not course_id, so it can't be ORDER BY'd in the paged query —
-- we denormalise the total onto the course. Populated by
-- scripts/recompute-info-count.mjs (run after imports / periodically).
-- =============================================================================

alter table public.courses add column if not exists info_count int not null default 0;
create index if not exists idx_courses_info_count on public.courses (info_count desc);

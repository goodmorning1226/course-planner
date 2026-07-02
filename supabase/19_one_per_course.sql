-- =============================================================================
-- 19_one_per_course.sql — one review / one grade report per (user, course).
--
-- Was: unique (user_id, match_key, semester) → a user could keep one row per
-- semester. Now: unique (user_id, match_key) → a user keeps a SINGLE row per
-- course; editing can change which semester it's for. The APIs already upsert on
-- (user_id, match_key); this makes the DB agree (and lets that upsert work).
--
-- Idempotent: dedups existing rows first (keeps the most-recently-updated per
-- user+course), then swaps the constraint.
-- =============================================================================

-- course_reviews ------------------------------------------------------------
delete from public.course_reviews a
using public.course_reviews b
where a.user_id = b.user_id
  and a.match_key = b.match_key
  and (a.updated_at < b.updated_at or (a.updated_at = b.updated_at and a.id < b.id));
alter table public.course_reviews drop constraint if exists uq_review_user_course_sem;
alter table public.course_reviews drop constraint if exists uq_review_user_course;
alter table public.course_reviews add constraint uq_review_user_course unique (user_id, match_key);

-- grade_reports -------------------------------------------------------------
delete from public.grade_reports a
using public.grade_reports b
where a.user_id = b.user_id
  and a.match_key = b.match_key
  and (a.updated_at < b.updated_at or (a.updated_at = b.updated_at and a.id < b.id));
alter table public.grade_reports drop constraint if exists uq_report_user_course_sem;
alter table public.grade_reports drop constraint if exists uq_report_user_course;
alter table public.grade_reports add constraint uq_report_user_course unique (user_id, match_key);

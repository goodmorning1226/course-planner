-- =============================================================================
-- 18_one_per_course.sql — one review / one grade report per user per COURSE
--
-- Was: 一人一(課身分)一學期 — unique (user_id, match_key, semester).
-- Now: 一人一(課身分)     — unique (user_id, match_key). A user may only keep a
-- single review and a single grade report per course; submitting for another
-- semester replaces their existing one.
--
-- Existing duplicates (same user + course, different semesters) are deduped by
-- keeping the most recently updated row before the tighter constraint is added.
-- =============================================================================

-- --- course_reviews ----------------------------------------------------------
delete from public.course_reviews a
  using public.course_reviews b
  where a.user_id = b.user_id
    and a.match_key = b.match_key
    and a.id <> b.id
    and (a.updated_at < b.updated_at
      or (a.updated_at = b.updated_at and a.id < b.id));

alter table public.course_reviews drop constraint if exists uq_review_user_course_sem;
alter table public.course_reviews drop constraint if exists uq_review_user_course;
alter table public.course_reviews add constraint uq_review_user_course
  unique (user_id, match_key);

-- --- grade_reports -----------------------------------------------------------
delete from public.grade_reports a
  using public.grade_reports b
  where a.user_id = b.user_id
    and a.match_key = b.match_key
    and a.id <> b.id
    and (a.updated_at < b.updated_at
      or (a.updated_at = b.updated_at and a.id < b.id));

alter table public.grade_reports drop constraint if exists uq_report_user_course_sem;
alter table public.grade_reports drop constraint if exists uq_report_user_course;
alter table public.grade_reports add constraint uq_report_user_course
  unique (user_id, match_key);

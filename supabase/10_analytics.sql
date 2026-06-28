-- =============================================================================
-- 10_analytics.sql — anonymous timetable activity (for 已排課人數)
--
-- Non-logged-in users keep their timetable in localStorage (invisible to the
-- server), so to count them we record an anonymous, PII-free signal: a random
-- client_id + how many courses they currently have. Logged-in users are still
-- counted via timetable_courses; this table covers the rest.
--
-- (Page-view time-series for the charts reuses site_stats with bucket keys like
--  "pv:2026-06-28" / "pvh:2026-06-28T14" — no extra table needed.)
-- =============================================================================

create table if not exists public.timetable_activity (
  client_id    text primary key,            -- random uuid in the browser's localStorage
  course_count int  not null default 0,     -- courses currently in their timetable
  updated_at   timestamptz not null default now()
);

alter table public.timetable_activity enable row level security;
-- no policies → service-role only (written by /api/track-timetable, read by admin).

-- =============================================================================
-- 11_scrape_revamp.sql — soft-delete (停開), per-section scrape, change log
--
-- ADDITIVE + idempotent. Paste into Supabase SQL Editor (also folded into
-- 00_full_setup.sql). Adds:
--   · courses.status / removed_at — soft-delete ("停開") instead of hard delete,
--     so a course that vanishes from source is flagged (and shown struck-through
--     in users' timetables) rather than silently disappearing.
--   · scrape_buildings — BuildingDDL value↔label map, so the admin UI can speak
--     labels while the scraper triggers a single section by its DDL value.
--   · scrape_runs.section — which section ('all' | <label> | '其他' | 'ntust').
--   · course_changes — per-scrape change log (added/removed/restored/updated),
--     with snapshot columns so the log survives independent of the course row.
-- =============================================================================

create extension if not exists "pgcrypto";

-- --- soft-delete on courses --------------------------------------------------
alter table public.courses
  add column if not exists status text not null default 'active';   -- active | removed
alter table public.courses
  add column if not exists removed_at timestamptz;                  -- when it went 停開
create index if not exists idx_courses_status on public.courses(status) where status = 'removed';

-- --- per-section scrape scope -------------------------------------------------
alter table public.scrape_runs
  add column if not exists section text;   -- 'all' | <建物 label> | '其他' | 'ntust'

-- --- BuildingDDL value↔label map (drives single-section triggers) ------------
create table if not exists public.scrape_buildings (
  value      text primary key,          -- BuildingDDL value, e.g. '1'; 其他 = '%'
  label      text not null,             -- display label, e.g. '文學院'
  updated_at timestamptz not null default now()
);
alter table public.scrape_buildings enable row level security;
-- no policies → service-role only.

-- --- course change log --------------------------------------------------------
-- Snapshot columns (course_pk/name/building) are kept on the row so the log is
-- meaningful even if the course row later changes or is purged. course_id is
-- nullable + intentionally NOT a FK (history must outlive the course).
create table if not exists public.course_changes (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid,
  course_id           uuid,
  course_pk           text,
  course_name         text,
  building_or_college text,
  change_type         text not null,   -- added|removed|restored|updated|removal_skipped
  detail              jsonb,           -- {teacher:{from,to}, time:{from,to}, classroom:{from,to}, sessions:{added,removed}}
  changed_on          date not null,   -- Taiwan (UTC+8) date bucket
  created_at          timestamptz not null default now()
);
create index if not exists idx_course_changes_day on public.course_changes(changed_on desc);
create index if not exists idx_course_changes_run on public.course_changes(run_id);
alter table public.course_changes enable row level security;
-- no policies → service-role only (read via admin-gated server route).

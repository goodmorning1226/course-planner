-- =============================================================================
-- 01_schema.sql — tables, functions & triggers for course-planner
-- Unofficial NTU 115-1 tentative course planner.
--
-- Run in Supabase SQL Editor (or via 00_full_setup.sql). Idempotent: uses
-- "create ... if not exists" and re-creatable functions/triggers.
--
-- IMPORTANT: This does NOT touch Supabase Auth. We reference auth.users but
-- never redefine it. We never create our own users table.
-- =============================================================================

-- gen_random_uuid()
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- updated_at trigger function (shared). Sets updated_at = now() on UPDATE.
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- courses — one row per course (學期 + 流水號). Scraped from the NTU
-- classroom-usage system. Public read; written only by the scraper
-- (service role, which bypasses RLS). Time/room details live in course_sessions.
-- -----------------------------------------------------------------------------
create table if not exists public.courses (
  id                  uuid primary key default gen_random_uuid(),
  semester            text        not null,                 -- 學期 e.g. '115-1'
  pk                  text,                                 -- 流水號 / 來源 PK
  building_or_college text,                                 -- 建物 / 學院
  course_name         text        not null,                -- 課名
  class_group         text,                                 -- 班次
  teacher             text,                                 -- 教師
  source_url          text,                                 -- 資料來源 URL
  scraped_at          timestamptz not null default now(),  -- 爬取時間
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- A course is uniquely identified by its semester + source PK. Prevents
  -- duplicate rows on re-import (upsert target). (Rows with NULL pk are not
  -- deduped by this constraint — the scraper should always provide pk.)
  constraint courses_semester_pk_key unique (semester, pk)
);

comment on table public.courses is
  'Scraped NTU course headers. Public read-only; written by scraper (service role).';

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- course_sessions — one row per meeting time/room of a course. A course may
-- have several sessions (e.g. Mon 3–4 + Wed 3–4). Public read; scraper writes.
-- -----------------------------------------------------------------------------
create table if not exists public.course_sessions (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  weekday       int  check (weekday between 1 and 7),       -- 星期 1–7
  classroom     text,                                       -- 教室
  raw_time_text text,                                       -- 原始時間 "10:20-12:10"
  periods       text[] not null default '{}',               -- 轉換後節次 {3,4}/{A,B}
  start_time    time,                                       -- 起 (optional)
  end_time      time,                                       -- 迄 (optional)
  created_at    timestamptz not null default now(),
  -- Prevent duplicate session rows on re-import.
  constraint course_sessions_unique
    unique (course_id, weekday, raw_time_text, classroom)
);

comment on table public.course_sessions is
  'Per-meeting time/room for a course. Public read-only; written by scraper.';

-- -----------------------------------------------------------------------------
-- user_timetables — a named, per-user tentative timetable. A user may keep
-- several. RLS restricts every row to its owner.
-- -----------------------------------------------------------------------------
create table if not exists public.user_timetables (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null default '我的暫排課表',
  semester   text not null default '115-1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_timetables is
  'Per-user named timetable. RLS restricts access to the owner.';

drop trigger if exists trg_user_timetables_updated_at on public.user_timetables;
create trigger trg_user_timetables_updated_at
  before update on public.user_timetables
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- timetable_courses — join: which courses are in which timetable. RLS is
-- enforced via the parent timetable's ownership.
-- -----------------------------------------------------------------------------
create table if not exists public.timetable_courses (
  id           uuid primary key default gen_random_uuid(),
  timetable_id uuid not null references public.user_timetables (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  created_at   timestamptz not null default now(),
  -- Same course cannot be added twice to one timetable.
  constraint timetable_courses_unique unique (timetable_id, course_id)
);

comment on table public.timetable_courses is
  'Join of timetable -> course. Access controlled via owning user_timetables.';

-- -----------------------------------------------------------------------------
-- scrape_runs — log of scraper executions. Server/service-role only; not
-- readable or writable by normal users.
-- -----------------------------------------------------------------------------
create table if not exists public.scrape_runs (
  id            uuid primary key default gen_random_uuid(),
  semester      text not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null,            -- 'running' | 'success' | 'error'
  course_count  int default 0,
  error_message text
);

comment on table public.scrape_runs is
  'Scraper run log. Service-role only; no client access (RLS denies all).';

-- -----------------------------------------------------------------------------
-- course_metadata / course_requirements (classification enrichment) live in
-- 05_course_metadata.sql (tables + triggers). 00_full_setup.sql also includes them.
-- -----------------------------------------------------------------------------

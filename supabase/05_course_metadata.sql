-- =============================================================================
-- 05_course_metadata.sql — course classification / metadata enrichment
--
-- ADDITIVE migration. Safe to paste into Supabase SQL Editor on a DB that
-- already has courses / course_sessions / user_timetables. Does NOT touch any
-- existing table or Supabase Auth. Idempotent.
--
-- Two new tables:
--   course_metadata     — the course's OWN classification (通識 A1–A8,
--                         共同必修/選修, 院系所課程, 學分, 課號…). One row per course.
--   course_requirements — whether the course is 必修/選修 FOR a given
--                         department / college (audience-relative). Many per course.
--
-- Both are public-read; only the service role (bypasses RLS) writes them.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- shared updated_at trigger fn (same as the rest of the schema)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- course_metadata — the course's own classification. One row per course.
-- -----------------------------------------------------------------------------
create table if not exists public.course_metadata (
  id                         uuid primary key default gen_random_uuid(),
  course_id                  uuid not null references public.courses (id) on delete cascade,
  official_semester          text,
  official_course_code       text,            -- 課號
  official_course_identifier text,            -- 課程識別碼
  credits                    numeric,
  course_type_raw            text,            -- 原始分類文字（保留官方/歷史原文）
  course_type_normalized     text not null default 'unknown'
    check (course_type_normalized in (
      'common_required','common_elective','general_education','departmental',
      'college_departmental','university_wide','military','freshman_seminar',
      'freshman_lecture','writing','career_communication','intercollegiate','unknown'
    )),
  categories                 text[] not null default '{}',
  is_general_education        boolean not null default false,
  ge_categories              text[] not null default '{}',  -- e.g. {A1,A7}
  ge_labels                  text[] not null default '{}',  -- e.g. {文學與藝術}
  ge_creditable              boolean,
  source                     text not null default 'unknown',   -- official_1151 / historical_match / course_code_inference / unknown
  confidence                 text not null default 'unknown'
    check (confidence in ('high','medium','low','unknown')),
  matched_semester           text,
  matched_at                 timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint course_metadata_course_unique unique (course_id) -- one row per course
);

comment on table public.course_metadata is
  'Per-course classification (通識/共同/院系所…). Public read; service-role write.';

drop trigger if exists trg_course_metadata_updated_at on public.course_metadata;
create trigger trg_course_metadata_updated_at
  before update on public.course_metadata
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- course_requirements — required/elective relative to a target dept / college.
-- A course can be 必修 for one dept and 選修 for another → many rows per course.
-- -----------------------------------------------------------------------------
create table if not exists public.course_requirements (
  id                      uuid primary key default gen_random_uuid(),
  course_id               uuid not null references public.courses (id) on delete cascade,
  target_department_name  text,
  target_department_code  text,
  target_college_name     text,
  audience_raw            text,
  requirement_raw         text,
  requirement_normalized  text not null default 'unknown'
    check (requirement_normalized in (
      'required','elective','required_elective','optional_required',
      'college_required','college_elective','common_required','common_elective','unknown'
    )),
  source                  text not null default 'unknown',
  confidence              text not null default 'unknown'
    check (confidence in ('high','medium','low','unknown')),
  matched_semester        text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- Prevent duplicate (course, audience, requirement) rows on re-enrichment.
  constraint course_requirements_unique
    unique (course_id, target_department_name, requirement_normalized)
);

comment on table public.course_requirements is
  'Course required/elective status relative to a department/college. Public read; service-role write.';

drop trigger if exists trg_course_requirements_updated_at on public.course_requirements;
create trigger trg_course_requirements_updated_at
  before update on public.course_requirements
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
create index if not exists idx_course_metadata_course      on public.course_metadata (course_id);
create index if not exists idx_course_metadata_type         on public.course_metadata (course_type_normalized);
create index if not exists idx_course_metadata_ge           on public.course_metadata (is_general_education);
create index if not exists idx_course_metadata_ge_cats      on public.course_metadata using gin (ge_categories);
create index if not exists idx_course_metadata_categories   on public.course_metadata using gin (categories);
create index if not exists idx_course_metadata_source       on public.course_metadata (source);
create index if not exists idx_course_metadata_confidence   on public.course_metadata (confidence);

create index if not exists idx_course_req_course            on public.course_requirements (course_id);
create index if not exists idx_course_req_dept              on public.course_requirements (target_department_name);
create index if not exists idx_course_req_dept_trgm
  on public.course_requirements using gin (target_department_name gin_trgm_ops);
create index if not exists idx_course_req_norm              on public.course_requirements (requirement_normalized);
create index if not exists idx_course_req_source            on public.course_requirements (source);
create index if not exists idx_course_req_confidence        on public.course_requirements (confidence);

-- -----------------------------------------------------------------------------
-- RLS: public read; no client write (service role bypasses RLS).
-- -----------------------------------------------------------------------------
alter table public.course_metadata enable row level security;
drop policy if exists "course_metadata_select_public" on public.course_metadata;
create policy "course_metadata_select_public"
  on public.course_metadata for select using (true);

alter table public.course_requirements enable row level security;
drop policy if exists "course_requirements_select_public" on public.course_requirements;
create policy "course_requirements_select_public"
  on public.course_requirements for select using (true);

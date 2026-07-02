-- =============================================================================
-- 00_full_setup.sql — ONE-SHOT setup for course-planner
-- Unofficial NTU 115-1 tentative course planner.
--
-- Paste this ENTIRE file into the Supabase SQL Editor and run once.
-- It is idempotent (safe to re-run) and contains, in order:
--   1. extensions
--   2. functions (updated_at trigger fn)
--   3. schema   (tables + triggers)         — see 01_schema.sql
--   4. indexes  (incl. trigram name search) — see 03_indexes.sql
--   5. RLS policies                          — see 02_rls_policies.sql
--   6. sample seed (FAKE data)               — see 04_seed_sample.sql  [optional]
--
-- Does NOT modify Supabase Auth. References auth.users but never redefines it;
-- never creates its own users table.
--
-- The scraper writes with the service-role key (bypasses RLS). Clients use the
-- anon key and are fully constrained by the policies below.
-- =============================================================================

-- ============================ 1. EXTENSIONS ==================================
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- trigram search

-- ============================ 2. FUNCTIONS ===================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================ 3. SCHEMA ======================================
create table if not exists public.courses (
  id                  uuid primary key default gen_random_uuid(),
  semester            text        not null,
  pk                  text,
  building_or_college text,
  course_name         text        not null,
  class_group         text,
  teacher             text,
  source_url          text,
  scraped_at          timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint courses_semester_pk_key unique (semester, pk)
);

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create table if not exists public.course_sessions (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  weekday       int  check (weekday between 1 and 7),
  classroom     text,
  raw_time_text text,
  periods       text[] not null default '{}',
  start_time    time,
  end_time      time,
  created_at    timestamptz not null default now(),
  constraint course_sessions_unique
    unique (course_id, weekday, raw_time_text, classroom)
);

create table if not exists public.user_timetables (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null default '我的暫排課表',
  semester   text not null default '115-1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_timetables_updated_at on public.user_timetables;
create trigger trg_user_timetables_updated_at
  before update on public.user_timetables
  for each row execute function public.set_updated_at();

create table if not exists public.timetable_courses (
  id           uuid primary key default gen_random_uuid(),
  timetable_id uuid not null references public.user_timetables (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint timetable_courses_unique unique (timetable_id, course_id)
);

create table if not exists public.scrape_runs (
  id            uuid primary key default gen_random_uuid(),
  semester      text not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null,
  course_count  int default 0,
  error_message text
);

-- ============================ 4. INDEXES =====================================
create index if not exists idx_courses_semester     on public.courses (semester);
create index if not exists idx_courses_pk           on public.courses (pk);
create index if not exists idx_courses_building      on public.courses (building_or_college);
create index if not exists idx_courses_name_trgm
  on public.courses using gin (course_name gin_trgm_ops);
create index if not exists idx_courses_teacher_trgm
  on public.courses using gin (teacher gin_trgm_ops);

create index if not exists idx_sessions_weekday   on public.course_sessions (weekday);
create index if not exists idx_sessions_classroom on public.course_sessions (classroom);
create index if not exists idx_sessions_course    on public.course_sessions (course_id);
create index if not exists idx_sessions_periods
  on public.course_sessions using gin (periods);

create index if not exists idx_timetable_courses_timetable
  on public.timetable_courses (timetable_id);
create index if not exists idx_timetable_courses_course
  on public.timetable_courses (course_id);
create index if not exists idx_user_timetables_user
  on public.user_timetables (user_id);

-- ============================ 5. RLS POLICIES ================================
-- courses: public read; no client write.
alter table public.courses enable row level security;
drop policy if exists "courses_select_public" on public.courses;
create policy "courses_select_public"
  on public.courses for select using (true);

-- course_sessions: public read; no client write.
alter table public.course_sessions enable row level security;
drop policy if exists "course_sessions_select_public" on public.course_sessions;
create policy "course_sessions_select_public"
  on public.course_sessions for select using (true);

-- user_timetables: owner-only.
alter table public.user_timetables enable row level security;
drop policy if exists "user_timetables_select_own" on public.user_timetables;
create policy "user_timetables_select_own"
  on public.user_timetables for select using (auth.uid() = user_id);
drop policy if exists "user_timetables_insert_own" on public.user_timetables;
create policy "user_timetables_insert_own"
  on public.user_timetables for insert with check (auth.uid() = user_id);
drop policy if exists "user_timetables_update_own" on public.user_timetables;
create policy "user_timetables_update_own"
  on public.user_timetables for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_timetables_delete_own" on public.user_timetables;
create policy "user_timetables_delete_own"
  on public.user_timetables for delete using (auth.uid() = user_id);

-- timetable_courses: access via owning timetable.
alter table public.timetable_courses enable row level security;
drop policy if exists "timetable_courses_select_own" on public.timetable_courses;
create policy "timetable_courses_select_own"
  on public.timetable_courses for select using (
    exists (select 1 from public.user_timetables t
            where t.id = timetable_courses.timetable_id and t.user_id = auth.uid())
  );
drop policy if exists "timetable_courses_insert_own" on public.timetable_courses;
create policy "timetable_courses_insert_own"
  on public.timetable_courses for insert with check (
    exists (select 1 from public.user_timetables t
            where t.id = timetable_courses.timetable_id and t.user_id = auth.uid())
  );
drop policy if exists "timetable_courses_delete_own" on public.timetable_courses;
create policy "timetable_courses_delete_own"
  on public.timetable_courses for delete using (
    exists (select 1 from public.user_timetables t
            where t.id = timetable_courses.timetable_id and t.user_id = auth.uid())
  );

-- scrape_runs: RLS on, no policies => denied to all clients (service-role only).
alter table public.scrape_runs enable row level security;

-- ============================ 5b. COURSE METADATA / REQUIREMENTS =============
-- Classification enrichment (通識/共同/院系所…). Public read; service-role write.
create table if not exists public.course_metadata (
  id                         uuid primary key default gen_random_uuid(),
  course_id                  uuid not null references public.courses (id) on delete cascade,
  official_semester          text,
  official_course_code       text,
  official_course_identifier text,
  credits                    numeric,
  course_type_raw            text,
  course_type_normalized     text not null default 'unknown'
    check (course_type_normalized in (
      'common_required','common_elective','general_education','departmental',
      'college_departmental','university_wide','military','freshman_seminar',
      'freshman_lecture','writing','career_communication','intercollegiate','unknown')),
  categories                 text[] not null default '{}',
  is_general_education        boolean not null default false,
  ge_categories              text[] not null default '{}',
  ge_labels                  text[] not null default '{}',
  ge_creditable              boolean,
  source                     text not null default 'unknown',
  confidence                 text not null default 'unknown'
    check (confidence in ('high','medium','low','unknown')),
  matched_semester           text,
  matched_at                 timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint course_metadata_course_unique unique (course_id)
);
drop trigger if exists trg_course_metadata_updated_at on public.course_metadata;
create trigger trg_course_metadata_updated_at
  before update on public.course_metadata
  for each row execute function public.set_updated_at();

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
      'college_required','college_elective','common_required','common_elective','unknown')),
  source                  text not null default 'unknown',
  confidence              text not null default 'unknown'
    check (confidence in ('high','medium','low','unknown')),
  matched_semester        text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint course_requirements_unique
    unique (course_id, target_department_name, requirement_normalized)
);
drop trigger if exists trg_course_requirements_updated_at on public.course_requirements;
create trigger trg_course_requirements_updated_at
  before update on public.course_requirements
  for each row execute function public.set_updated_at();

create index if not exists idx_course_metadata_course    on public.course_metadata (course_id);
create index if not exists idx_course_metadata_type      on public.course_metadata (course_type_normalized);
create index if not exists idx_course_metadata_ge        on public.course_metadata (is_general_education);
create index if not exists idx_course_metadata_ge_cats   on public.course_metadata using gin (ge_categories);
create index if not exists idx_course_metadata_categories on public.course_metadata using gin (categories);
create index if not exists idx_course_metadata_source    on public.course_metadata (source);
create index if not exists idx_course_metadata_confidence on public.course_metadata (confidence);
create index if not exists idx_course_req_course         on public.course_requirements (course_id);
create index if not exists idx_course_req_dept           on public.course_requirements (target_department_name);
create index if not exists idx_course_req_dept_trgm
  on public.course_requirements using gin (target_department_name gin_trgm_ops);
create index if not exists idx_course_req_norm           on public.course_requirements (requirement_normalized);
create index if not exists idx_course_req_source         on public.course_requirements (source);
create index if not exists idx_course_req_confidence     on public.course_requirements (confidence);

alter table public.course_metadata enable row level security;
drop policy if exists "course_metadata_select_public" on public.course_metadata;
create policy "course_metadata_select_public"
  on public.course_metadata for select using (true);
alter table public.course_requirements enable row level security;
drop policy if exists "course_requirements_select_public" on public.course_requirements;
create policy "course_requirements_select_public"
  on public.course_requirements for select using (true);

-- ============================ 5c. SCRAPE REVAMP (see 11_scrape_revamp.sql) ===
-- soft-delete (停開), per-section scrape, change log.
alter table public.courses
  add column if not exists status text not null default 'active';
alter table public.courses
  add column if not exists removed_at timestamptz;
create index if not exists idx_courses_status on public.courses(status) where status = 'removed';

alter table public.scrape_runs
  add column if not exists section text;

create table if not exists public.scrape_buildings (
  value      text primary key,
  label      text not null,
  updated_at timestamptz not null default now()
);
alter table public.scrape_buildings enable row level security;

create table if not exists public.course_changes (
  id                  uuid primary key default gen_random_uuid(),
  run_id              uuid,
  course_id           uuid,
  course_pk           text,
  course_name         text,
  building_or_college text,
  change_type         text not null,
  detail              jsonb,
  changed_on          date not null,
  created_at          timestamptz not null default now()
);
create index if not exists idx_course_changes_day on public.course_changes(changed_on desc);
create index if not exists idx_course_changes_run on public.course_changes(run_id);
alter table public.course_changes enable row level security;

-- ============================ 5d. REVIEWS + GRADES (see 12_reviews_grades.sql) =
-- 修課情報：課程評價 + 成績分布（以 match_key=正規化 課名|教師 當課程身分）。
create table if not exists public.course_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_name text not null, teacher text, match_key text not null, semester text not null,
  rating_overall numeric(2,1) not null, rating_sweet numeric(2,1),
  rating_chill numeric(2,1), rating_solid numeric(2,1) not null,
  comment text, like_count int not null default 0, report_count int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint chk_review_ratings check (
    rating_overall in (0.5,1,1.5,2,2.5,3,3.5,4,4.5,5) and rating_sweet in (0.5,1,1.5,2,2.5,3,3.5,4,4.5,5) and
    rating_chill in (0.5,1,1.5,2,2.5,3,3.5,4,4.5,5) and rating_solid in (0.5,1,1.5,2,2.5,3,3.5,4,4.5,5)),
  constraint uq_review_user_course_sem unique (user_id, match_key, semester)
);
create index if not exists idx_reviews_match on public.course_reviews(match_key);
create index if not exists idx_reviews_user on public.course_reviews(user_id);
drop trigger if exists trg_course_reviews_updated_at on public.course_reviews;
create trigger trg_course_reviews_updated_at before update on public.course_reviews
  for each row execute function public.set_updated_at();
alter table public.course_reviews enable row level security;
drop policy if exists "course_reviews_select_public" on public.course_reviews;
create policy "course_reviews_select_public" on public.course_reviews for select using (true);
drop policy if exists "course_reviews_insert_own" on public.course_reviews;
create policy "course_reviews_insert_own" on public.course_reviews for insert with check (auth.uid() = user_id);
drop policy if exists "course_reviews_update_own" on public.course_reviews;
create policy "course_reviews_update_own" on public.course_reviews for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "course_reviews_delete_own" on public.course_reviews;
create policy "course_reviews_delete_own" on public.course_reviews for delete using (auth.uid() = user_id);

create table if not exists public.review_likes (
  review_id uuid not null references public.course_reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (review_id, user_id)
);
alter table public.review_likes enable row level security;

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.course_reviews(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text, created_at timestamptz not null default now(),
  constraint uq_report_user_review unique (review_id, user_id)
);
alter table public.review_reports enable row level security;

create table if not exists public.grade_distributions (
  id uuid primary key default gen_random_uuid(),
  course_name text not null, teacher text, match_key text not null, semester text not null,
  a_plus numeric, a numeric, a_minus numeric, b_plus numeric, b numeric, b_minus numeric,
  c_plus numeric, c numeric, c_minus numeric, f numeric,
  note text, source text, submitted_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint uq_grade_course_sem unique (match_key, semester)
);
create index if not exists idx_grades_match on public.grade_distributions(match_key);
drop trigger if exists trg_grade_distributions_updated_at on public.grade_distributions;
create trigger trg_grade_distributions_updated_at before update on public.grade_distributions
  for each row execute function public.set_updated_at();
alter table public.grade_distributions enable row level security;
drop policy if exists "grade_distributions_select_public" on public.grade_distributions;
create policy "grade_distributions_select_public" on public.grade_distributions for select using (true);

-- ============================ 5e. PRESENCE (see 13_presence.sql) =============
create table if not exists public.active_sessions (
  client_id text primary key,
  last_seen  timestamptz not null default now()
);
create index if not exists idx_active_sessions_seen on public.active_sessions(last_seen);
alter table public.active_sessions enable row level security;

create table if not exists public.presence (
  bucket    text not null,
  client_id text not null,
  primary key (bucket, client_id)
);
alter table public.presence enable row level security;

-- ============================ 5f. CONTENT AUDIT (see 14_content_audit.sql) ===
create table if not exists public.content_audit (
  id uuid primary key default gen_random_uuid(),
  kind text not null, action text not null,
  course_name text, teacher text, semester text,
  user_id uuid, detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_content_audit_created on public.content_audit(created_at desc);
create index if not exists idx_content_audit_kind on public.content_audit(kind);
alter table public.content_audit enable row level security;

-- ============================ 6. SAMPLE SEED (FAKE) ==========================
-- Optional. Dummy data for local front-end development only. Delete this block
-- if you only want the schema. user_timetables / timetable_courses are NOT
-- seeded (they need a real auth.users id).
with seeded as (
  insert into public.courses
    (semester, pk, building_or_college, course_name, class_group, teacher, source_url)
  values
    ('115-1', 'S0001', '共同教室',   '範例課程：微積分（甲）', '01',  '王小明', 'sample-seed'),
    ('115-1', 'S0002', '電機二館',   '範例課程：資料結構',     null,  '李大華', 'sample-seed'),
    ('115-1', 'S0003', '普通教學館', '範例課程：社會學概論',   'A',   '陳美玲', 'sample-seed'),
    ('115-1', 'S0004', '共同教室',   '範例課程：英文（中級）', '02',  '張文彬', 'sample-seed'),
    ('115-1', 'S0005', '管理學院',   '範例課程：行銷管理',     null,  '林志豪', 'sample-seed')
  on conflict (semester, pk) do update
    set course_name = excluded.course_name, scraped_at = now()
  returning id, pk
)
insert into public.course_sessions
  (course_id, weekday, classroom, raw_time_text, periods, start_time, end_time)
select id, v.weekday, v.classroom, v.raw_time_text, v.periods, v.start_time, v.end_time
from seeded
join (values
    ('S0001', 1, '101', '10:20-12:10', '{3,4}'::text[],   time '10:20', time '12:10'),
    ('S0002', 3, '105', '09:10-12:10', '{2,3,4}'::text[], time '09:10', time '12:10'),
    ('S0003', 5, '201', '13:20-15:10', '{6,7}'::text[],   time '13:20', time '15:10'),
    ('S0004', 1, '101', '10:20-11:10', '{3}'::text[],     time '10:20', time '11:10'),
    ('S0005', 2, '301', '18:25-20:10', '{A,B}'::text[],   time '18:25', time '20:10')
  ) as v(pk, weekday, classroom, raw_time_text, periods, start_time, end_time)
  on seeded.pk = v.pk
on conflict (course_id, weekday, raw_time_text, classroom) do nothing;

insert into public.scrape_runs (semester, started_at, finished_at, status, course_count)
values ('115-1', now(), now(), 'success', (select count(*) from public.courses));

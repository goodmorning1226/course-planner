-- =============================================================================
-- 12_reviews_grades.sql — 修課情報：課程評價 + 成績分布
--
-- ADDITIVE + idempotent. Paste into Supabase SQL Editor (also in 00_full_setup).
-- Both features are keyed by COURSE IDENTITY (match_key = 正規化 課名|教師), not a
-- 115-1 course id, because the data is historical (any past semester).
--
--   · course_reviews      — public 讀；owner 寫；一人一(課身分)一學期一篇
--   · review_likes        — service-role only（按讚，計數去正規化在 like_count）
--   · review_reports      — service-role only（檢舉）
--   · grade_distributions — public 讀；service-role 寫（匯入器 + 補填 API）
-- =============================================================================

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

-- --- 課程評價 ----------------------------------------------------------------
create table if not exists public.course_reviews (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  course_name    text not null,                 -- 顯示用
  teacher        text,                          -- 顯示用
  match_key      text not null,                 -- 正規化 課名|教師
  semester       text not null,                 -- 'XXX-Y'
  rating_overall numeric(2,1) not null,         -- 總體（必填）
  rating_sweet   numeric(2,1),                  -- 甜度（選填）
  rating_chill   numeric(2,1),                  -- 涼度（選填）
  rating_solid   numeric(2,1) not null,         -- 扎實
  comment        text,                          -- 選填
  like_count     int not null default 0,        -- 去正規化（like API 維護）
  report_count   int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_review_ratings check (
    rating_overall in (0.5,1,1.5,2,2.5,3,3.5,4,4.5,5) and
    rating_sweet   in (0.5,1,1.5,2,2.5,3,3.5,4,4.5,5) and
    rating_chill   in (0.5,1,1.5,2,2.5,3,3.5,4,4.5,5) and
    rating_solid   in (0.5,1,1.5,2,2.5,3,3.5,4,4.5,5)),
  constraint uq_review_user_course_sem unique (user_id, match_key, semester)
);
create index if not exists idx_reviews_match on public.course_reviews(match_key);
create index if not exists idx_reviews_user  on public.course_reviews(user_id);
drop trigger if exists trg_course_reviews_updated_at on public.course_reviews;
create trigger trg_course_reviews_updated_at
  before update on public.course_reviews
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

-- --- 按讚 / 檢舉（service-role only；存取一律經認證後的 API） ------------------
create table if not exists public.review_likes (
  review_id  uuid not null references public.course_reviews(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);
alter table public.review_likes enable row level security; -- no policies → service-role only

create table if not exists public.review_reports (
  id         uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.course_reviews(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  constraint uq_report_user_review unique (review_id, user_id)
);
alter table public.review_reports enable row level security; -- no policies → service-role only

-- --- 成績分布（public 讀；service-role 寫；一課一學期一筆） --------------------
create table if not exists public.grade_distributions (
  id           uuid primary key default gen_random_uuid(),
  course_name  text not null,
  teacher      text,
  match_key    text not null,
  semester     text not null,
  a_plus  numeric, a numeric, a_minus numeric,
  b_plus  numeric, b numeric, b_minus numeric,
  c_plus  numeric, c numeric, c_minus numeric,
  f       numeric,                              -- 百分比 0..100，可 null
  note         text,
  source       text,                            -- 'sheet:<id>' | 'user'
  submitted_by uuid references auth.users(id),  -- null = 匯入
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint uq_grade_course_sem unique (match_key, semester)
);
create index if not exists idx_grades_match on public.grade_distributions(match_key);
drop trigger if exists trg_grade_distributions_updated_at on public.grade_distributions;
create trigger trg_grade_distributions_updated_at
  before update on public.grade_distributions
  for each row execute function public.set_updated_at();

alter table public.grade_distributions enable row level security;
drop policy if exists "grade_distributions_select_public" on public.grade_distributions;
create policy "grade_distributions_select_public" on public.grade_distributions for select using (true);
-- no write policy → service-role only.

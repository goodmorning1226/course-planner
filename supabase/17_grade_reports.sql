-- =============================================================================
-- 17_grade_reports.sql — raw grade reports (成績分布 A 版, relative model)
--
-- NTU only shows each student three numbers relative to THEIR grade: same% /
-- above% / below%. We store that raw report (reporter's grade + those 3 numbers)
-- and reconstruct the per-grade distribution by combining reports across grades.
-- Existing imported grade_distributions rows are converted to reports on the
-- fly at read time (see lib/grades/reports.ts) — this table is only NEW,
-- first-hand user reports. A report reveals the reporter's grade → owner-only
-- RLS; the public aggregate is reconstructed server-side with NO per-person data.
-- =============================================================================

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create table if not exists public.grade_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  course_name text not null,
  teacher     text,
  match_key   text not null,
  semester    text not null,
  pivot       text not null,        -- reporter's grade: 'A+'…'F'
  same_pct    numeric,              -- % with the SAME grade (the only exact datum)
  above_pct   numeric,              -- % with a HIGHER grade (lump)
  below_pct   numeric,              -- % with a LOWER grade (lump)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint uq_report_user_course_sem unique (user_id, match_key, semester)
);
create index if not exists idx_grade_reports_match on public.grade_reports(match_key);
drop trigger if exists trg_grade_reports_updated_at on public.grade_reports;
create trigger trg_grade_reports_updated_at
  before update on public.grade_reports
  for each row execute function public.set_updated_at();

alter table public.grade_reports enable row level security;
drop policy if exists "grade_reports_select_own" on public.grade_reports;
create policy "grade_reports_select_own" on public.grade_reports for select using (auth.uid() = user_id);
drop policy if exists "grade_reports_insert_own" on public.grade_reports;
create policy "grade_reports_insert_own" on public.grade_reports for insert with check (auth.uid() = user_id);
drop policy if exists "grade_reports_update_own" on public.grade_reports;
create policy "grade_reports_update_own" on public.grade_reports for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "grade_reports_delete_own" on public.grade_reports;
create policy "grade_reports_delete_own" on public.grade_reports for delete using (auth.uid() = user_id);
-- aggregate reconstruction reads ALL rows via the service role (bypasses RLS).

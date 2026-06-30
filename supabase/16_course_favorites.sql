-- =============================================================================
-- 16_course_favorites.sql — per-user course favorites ("課程收藏")
--
-- A user flags courses they want to keep an eye on (the 旗幟 toggle on each
-- card). Owner-only RLS, mirroring user_timetables. Idempotent.
-- =============================================================================

create table if not exists public.course_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
create index if not exists idx_course_favorites_user on public.course_favorites(user_id, created_at desc);

alter table public.course_favorites enable row level security;
drop policy if exists "course_favorites_select_own" on public.course_favorites;
create policy "course_favorites_select_own" on public.course_favorites for select using (auth.uid() = user_id);
drop policy if exists "course_favorites_insert_own" on public.course_favorites;
create policy "course_favorites_insert_own" on public.course_favorites for insert with check (auth.uid() = user_id);
drop policy if exists "course_favorites_delete_own" on public.course_favorites;
create policy "course_favorites_delete_own" on public.course_favorites for delete using (auth.uid() = user_id);

-- =============================================================================
-- 02_rls_policies.sql — Row Level Security
--
-- Principle: clients use the anon key and are fully constrained by these
-- policies. The scraper uses the SERVICE-ROLE key, which BYPASSES RLS, so no
-- write policies are needed for the scraped tables.
--
-- Summary:
--   courses           : public read; no client write
--   course_sessions   : public read; no client write
--   user_timetables   : owner-only read/insert/update/delete
--   timetable_courses : access via owning timetable (read/insert/delete)
--   scrape_runs       : no client access at all (service-role only)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- courses: public read-only.
-- -----------------------------------------------------------------------------
alter table public.courses enable row level security;

drop policy if exists "courses_select_public" on public.courses;
create policy "courses_select_public"
  on public.courses for select using (true);
-- (No insert/update/delete policy => denied for anon & authenticated.)

-- -----------------------------------------------------------------------------
-- course_sessions: public read-only.
-- -----------------------------------------------------------------------------
alter table public.course_sessions enable row level security;

drop policy if exists "course_sessions_select_public" on public.course_sessions;
create policy "course_sessions_select_public"
  on public.course_sessions for select using (true);

-- -----------------------------------------------------------------------------
-- user_timetables: owner-only for every operation.
-- -----------------------------------------------------------------------------
alter table public.user_timetables enable row level security;

drop policy if exists "user_timetables_select_own" on public.user_timetables;
create policy "user_timetables_select_own"
  on public.user_timetables for select
  using (auth.uid() = user_id);

drop policy if exists "user_timetables_insert_own" on public.user_timetables;
create policy "user_timetables_insert_own"
  on public.user_timetables for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_timetables_update_own" on public.user_timetables;
create policy "user_timetables_update_own"
  on public.user_timetables for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_timetables_delete_own" on public.user_timetables;
create policy "user_timetables_delete_own"
  on public.user_timetables for delete
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- timetable_courses: a row is accessible only if its parent timetable belongs
-- to the current user. We check ownership via an EXISTS sub-query.
-- -----------------------------------------------------------------------------
alter table public.timetable_courses enable row level security;

drop policy if exists "timetable_courses_select_own" on public.timetable_courses;
create policy "timetable_courses_select_own"
  on public.timetable_courses for select
  using (
    exists (
      select 1 from public.user_timetables t
      where t.id = timetable_courses.timetable_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "timetable_courses_insert_own" on public.timetable_courses;
create policy "timetable_courses_insert_own"
  on public.timetable_courses for insert
  with check (
    exists (
      select 1 from public.user_timetables t
      where t.id = timetable_courses.timetable_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "timetable_courses_delete_own" on public.timetable_courses;
create policy "timetable_courses_delete_own"
  on public.timetable_courses for delete
  using (
    exists (
      select 1 from public.user_timetables t
      where t.id = timetable_courses.timetable_id
        and t.user_id = auth.uid()
    )
  );
-- (No update policy: timetable membership is add/remove only.)

-- -----------------------------------------------------------------------------
-- scrape_runs: enable RLS with NO policies => every client (anon &
-- authenticated) is denied. Only the service role (bypasses RLS) can use it.
-- -----------------------------------------------------------------------------
alter table public.scrape_runs enable row level security;
-- intentionally no policies.

-- course_metadata / course_requirements RLS (public read; service-role write)
-- lives in 05_course_metadata.sql (also folded into 00_full_setup.sql).

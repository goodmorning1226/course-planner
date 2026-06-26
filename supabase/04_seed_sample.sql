-- =============================================================================
-- 04_seed_sample.sql — FAKE sample data for local front-end development.
-- This is dummy data, NOT real NTU course data. Safe to run and re-run.
--
-- Note: we only seed scraped tables (courses / course_sessions) and a
-- scrape_runs row. user_timetables / timetable_courses require a real
-- auth.users id, so they are NOT seeded here — create those by signing up and
-- adding courses through the app.
-- =============================================================================

-- Upsert sample course headers, capturing their ids for the sessions below.
with seeded as (
  insert into public.courses
    (semester, pk, building_or_college, course_name, class_group, teacher, source_url)
  values
    ('115-1', 'S0001', '共同教室',     '範例課程：微積分（甲）', '01',  '王小明', 'sample-seed'),
    ('115-1', 'S0002', '電機二館',     '範例課程：資料結構',     null,  '李大華', 'sample-seed'),
    ('115-1', 'S0003', '普通教學館',   '範例課程：社會學概論',   'A',   '陳美玲', 'sample-seed'),
    ('115-1', 'S0004', '共同教室',     '範例課程：英文（中級）', '02',  '張文彬', 'sample-seed'),
    ('115-1', 'S0005', '管理學院',     '範例課程：行銷管理',     null,  '林志豪', 'sample-seed')
  on conflict (semester, pk) do update
    set course_name = excluded.course_name,
        scraped_at  = now()
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

-- A sample successful scrape-run record.
insert into public.scrape_runs (semester, started_at, finished_at, status, course_count)
values ('115-1', now(), now(), 'success', (select count(*) from public.courses));

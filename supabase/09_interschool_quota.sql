-- =============================================================================
-- 09_interschool_quota.sql — 校際課程「開放台大名額」欄位
--
-- ADDITIVE. 校際(三校聯盟) courses taught at other schools (e.g. 台科) carry a
-- 台大 cross-enrollment quota. Stored on `courses` (null for normal 台大 courses).
-- =============================================================================

alter table public.courses
  add column if not exists interschool_quota int;   -- 開放台大名額 (NTURestrict)

alter table public.courses
  add column if not exists interschool_taken int;    -- 已選台大人數 (NTU_People)

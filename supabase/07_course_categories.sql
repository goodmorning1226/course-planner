-- =============================================================================
-- 07_course_categories.sql — multi-category classification
--
-- ADDITIVE. A course can belong to several 課程網 categories (系所 / 通識 /
-- 共同 / 體育國防 / 學程 / 領域專長 / 校際 / 進階英語) at once, so we store them
-- as a text[] of slugs. Filtering uses array-contains.
-- =============================================================================

alter table public.course_metadata
  add column if not exists categories text[] not null default '{}';

create index if not exists idx_course_metadata_categories
  on public.course_metadata using gin (categories);

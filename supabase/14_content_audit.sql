-- =============================================================================
-- 14_content_audit.sql — audit log for user-generated content
--
-- ADDITIVE + idempotent. Records every add/edit/delete of a course review or a
-- grade distribution, so the admin can see who contributed/changed what.
-- Service-role only (written by the API after auth; read by an admin route).
-- =============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.content_audit (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,             -- 'review' | 'grade'
  action      text not null,             -- 'add' | 'edit' | 'delete'
  course_name text,
  teacher     text,
  semester    text,
  user_id     uuid,                       -- who performed the action
  detail      jsonb,                      -- ratings / buckets snapshot
  created_at  timestamptz not null default now()
);
create index if not exists idx_content_audit_created on public.content_audit(created_at desc);
create index if not exists idx_content_audit_kind on public.content_audit(kind);
alter table public.content_audit enable row level security; -- service-role only

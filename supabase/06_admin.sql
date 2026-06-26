-- =============================================================================
-- 06_admin.sql — admin backend: per-building scrape progress + site stats
--
-- ADDITIVE. Paste into Supabase SQL Editor. Does not touch existing tables.
-- Both tables are service-role only (RLS on, no policies) — the admin UI reads
-- them through admin-gated server routes that use the service-role key.
-- =============================================================================

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

-- Per-(run, building) live progress for the one-click scrape.
create table if not exists public.scrape_progress (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid not null,
  building      text not null,
  scraped_count int  not null default 0,   -- courses found so far this building
  total_count   int  not null default 0,   -- rooms total (denominator)
  done_rooms    int  not null default 0,   -- rooms processed so far
  status        text not null default 'pending', -- pending|running|done|error
  updated_at    timestamptz not null default now(),
  constraint scrape_progress_unique unique (run_id, building)
);
create index if not exists idx_scrape_progress_run on public.scrape_progress (run_id);

drop trigger if exists trg_scrape_progress_updated_at on public.scrape_progress;
create trigger trg_scrape_progress_updated_at
  before update on public.scrape_progress
  for each row execute function public.set_updated_at();

alter table public.scrape_progress enable row level security;
-- no policies → service-role only.

-- Simple site-wide counters (e.g. page_views). Incremented server-side.
create table if not exists public.site_stats (
  key        text primary key,
  count      bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.site_stats enable row level security;
-- no policies → service-role only.

-- Atomic increment helper (called by the service-role track route).
create or replace function public.increment_stat(k text)
returns void language sql as $$
  insert into public.site_stats (key, count) values (k, 1)
  on conflict (key) do update set count = public.site_stats.count + 1, updated_at = now();
$$;

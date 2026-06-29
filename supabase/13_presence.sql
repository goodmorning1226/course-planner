-- =============================================================================
-- 13_presence.sql — active-user presence (heartbeat)
--
-- ADDITIVE + idempotent. The frontend pings /api/heartbeat (~45s while the tab
-- is visible) with a random client id. We track:
--   · active_sessions — latest heartbeat per client → "active now" (last 5 min)
--   · presence        — dedup ledger of (hour/day bucket, client). The distinct
--     count per bucket is mirrored into site_stats keys
--     "active:d:YYYY-MM-DD" / "active:h:YYYY-MM-DDTHH" for cheap time-series reads
--     (same idea as the pv:/pvh: page-view buckets).
-- Both tables are service-role only (no policies); PII-free (random client id).
-- =============================================================================

create extension if not exists "pgcrypto";

create table if not exists public.active_sessions (
  client_id text primary key,
  last_seen  timestamptz not null default now()
);
create index if not exists idx_active_sessions_seen on public.active_sessions(last_seen);
alter table public.active_sessions enable row level security; -- service-role only

create table if not exists public.presence (
  bucket    text not null,          -- 'd:2026-06-30' | 'h:2026-06-30T14'
  client_id text not null,
  primary key (bucket, client_id)
);
alter table public.presence enable row level security;        -- service-role only

-- increment_stat(k text) already exists from 06_admin.sql (used for the counts).

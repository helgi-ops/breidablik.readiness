-- Pipeline-health alert dedup log (pipelineHealth/checks.ts + /api/admin/health/cron).
--
-- The daily system-health cron records the last-seen status per (team, check) here so
-- a persistent problem alerts ONCE, not every morning, and a recurrence after a clear
-- re-alerts. One row per (team_id, check_id); the cron upserts the current status each
-- run via the service role. Admin/owner observability surface only — never a readiness
-- verdict, never changes the monitored data.

create table if not exists public.pipeline_health_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  check_id text not null,
  status text not null,                 -- ok | info | amber | red
  detail text,
  as_of date not null default current_date,
  last_alerted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, check_id)
);

create index if not exists pipeline_health_log_team_idx on public.pipeline_health_log(team_id, updated_at desc);

alter table public.pipeline_health_log enable row level security;

-- Read-only for staff/owner; writes go through the service-role cron (no insert/update
-- policy), mirroring coach_signals.
drop policy if exists pipeline_health_log_read on public.pipeline_health_log;
create policy pipeline_health_log_read on public.pipeline_health_log for select
  using (is_staff());

grant select on public.pipeline_health_log to authenticated;
grant select, insert, update, delete on public.pipeline_health_log to service_role;

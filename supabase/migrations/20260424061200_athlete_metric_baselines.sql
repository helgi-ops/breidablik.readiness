-- Per-athlete baselines table for SD/CV-band scoring (Robertson 2017, Rebelo 2026).
-- One row per (player, metric_key). Refreshed daily by pg_cron from the last
-- 28 days of raw signals. Scoring engine reads from this table instead of
-- the global thresholds in src/lib/micropulse/decision/constants.ts.

create table if not exists public.athlete_metric_baselines (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null,
  metric_key      text not null,
  n_observations  integer not null,
  mean            numeric not null,
  sd              numeric not null default 0,
  cv              numeric,                     -- coefficient of variation = sd/|mean|
  median          numeric,                     -- robust alternative
  window_days     integer not null default 28,
  status          text not null default 'calibrating'
                  check (status in ('insufficient_data', 'calibrating', 'active')),
  computed_at     timestamptz not null default now(),
  unique (player_id, metric_key)
);

create index if not exists athlete_metric_baselines_player_idx
  on public.athlete_metric_baselines (player_id);
create index if not exists athlete_metric_baselines_metric_idx
  on public.athlete_metric_baselines (metric_key);
create index if not exists athlete_metric_baselines_status_idx
  on public.athlete_metric_baselines (status);

alter table public.athlete_metric_baselines enable row level security;

create policy coaches_read_team_baselines on public.athlete_metric_baselines
  for select to authenticated
  using (
    exists (
      select 1 from public.players p
      where p.id = athlete_metric_baselines.player_id
        and (
          p.team_id = (select team_id from public.profiles where id = auth.uid())
          or exists (
            select 1 from public.coach_teams ct
            where ct.coach_id = auth.uid() and ct.team_id = p.team_id
          )
        )
    )
  );

create policy player_reads_own_baselines on public.athlete_metric_baselines
  for select to authenticated
  using (
    player_id = (select player_id from public.profiles where id = auth.uid())
  );

comment on table public.athlete_metric_baselines is
  'Per-athlete personal baselines for SD/CV-band scoring (Robertson 2017). Refreshed daily by pg_cron.';

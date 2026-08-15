-- Peak-period / rolling-average load (ADI-grade). LONG format: one row per
-- (player, date, source, window_min, metric) = the worst rolling window of `window_min`
-- minutes for `metric` in that session. Feeds the power curve (peak value vs window
-- length) and rolling-maxima benchmarks. Needs the Catapult OpenField Peak-Period /
-- interval export (or Statsport/WIMU equivalents) — the daily summary table holds no
-- per-epoch series, so this is a separate ingestion path (Phase 2).
-- Descriptive load context only — NEVER feeds the readiness colour or the daily decision.
create table if not exists public.player_load_peak_period (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  date date not null,
  source text not null default 'catapult',
  window_min numeric not null,            -- rolling window length in minutes (1, 3, 5, …)
  metric text not null,                   -- 'player_load' | 'hsr' | 'metabolic_power' | 'accel_density' | …
  value numeric,                          -- peak (worst) rolling-window value for that metric
  unit text,
  created_at timestamptz not null default now(),
  unique (player_id, date, source, window_min, metric)
);
create index if not exists player_load_peak_period_player_date_idx
  on public.player_load_peak_period (player_id, date desc);
create index if not exists player_load_peak_period_team_idx
  on public.player_load_peak_period (team_id, date desc);

alter table public.player_load_peak_period enable row level security;

-- Coach reads their own team's rows (mirrors player_external_load_daily_coach_read_team).
create policy player_load_peak_period_coach_read_team on public.player_load_peak_period
  for select using (
    exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
        and (
          lower(coalesce(pr.role, '')) = 'admin'
          or pr.team_id = player_load_peak_period.team_id
          or player_load_peak_period.team_id in (
            select ct.team_id from public.coach_teams ct where ct.coach_id = auth.uid()
          )
        )
    )
  );

-- Player reads their own rows (mirrors player_external_load_daily_player_select_own).
create policy player_load_peak_period_player_select_own on public.player_load_peak_period
  for select using (
    exists (select 1 from public.players p where p.id = player_load_peak_period.player_id and p.user_id = auth.uid())
    or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.player_id = player_load_peak_period.player_id)
  );

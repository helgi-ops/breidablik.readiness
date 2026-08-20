-- Basketball season 5-man lineup units, from the InStat/Hudl "Lineups" export.
-- One row = one five-man unit's season line (per-game averages). The KKI/baskethotel
-- feed carries per-player box scores but no lineup data; InStat does. Powers the
-- Lineup Intelligence board (which units on the floor together actually win).
--
-- Descriptive context only -- it NEVER touches the readiness colour, the load, or the
-- daily decision. Source is unconstrained on purpose (mirrors the other basketball
-- tables): 'instat' today.
--
-- Applied via mcp apply_migration; committed here per the repo rule that every applied
-- migration is reproducible.

create table if not exists public.basketball_lineup_stats (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  source       text not null default 'instat',
  season       text,
  lineup_hash  text not null,                       -- sorted jerseys joined (e.g. '4-6-11-12-17')
  members      jsonb not null default '[]'::jsonb,  -- [{jersey,name,player_id|null}]
  -- Unit totals (per-game averages; nullable -- a missing stat is NULL, never 0).
  minutes_avg  numeric,
  possessions  numeric,
  points       numeric,
  plus_minus   numeric,
  fgm numeric, fga numeric,
  tpm numeric, tpa numeric,
  ftm numeric, fta numeric,
  oreb numeric, dreb numeric, reb numeric,
  assists numeric, steals numeric, turnovers numeric, fouls numeric,
  fg_pct numeric, tp_pct numeric, ft_pct numeric,
  -- Lossless catch-all.
  advanced     jsonb not null default '{}'::jsonb,
  -- Provenance (mandatory -- principle #1 of the manifesto).
  synced_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Idempotent on re-import: one row per unit / season / source / team.
  unique (team_id, source, season, lineup_hash)
);

create index if not exists basketball_lineup_stats_team_idx
  on public.basketball_lineup_stats (team_id, season);

alter table public.basketball_lineup_stats enable row level security;

-- Reads/writes mirror basketball_team_match_stats: coach/staff/admin of the team.
create policy "basketball_lineup_stats_coach_read" on public.basketball_lineup_stats
for select using (team_id in (select coach_team_ids()) or is_staff());
create policy "basketball_lineup_stats_coach_insert" on public.basketball_lineup_stats
for insert with check (team_id in (select coach_team_ids()) or is_staff());
create policy "basketball_lineup_stats_coach_update" on public.basketball_lineup_stats
for update using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());

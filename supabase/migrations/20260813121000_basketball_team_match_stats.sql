-- Basketball team-level per-match (and per-quarter) totals. The KKÍ/baskethotel
-- feed carries per-player box scores but no team line and no quarter splits; an
-- InStat/Hudl-grade feed does. One row = one team's line for one period of one
-- match. `is_opponent=false` is our own team's line, `true` is the opponent's,
-- so a single match yields both sides from the same source. `period='game'` is
-- the full-game total; 'q1'..'q4'/'ot1'.. are the quarter/OT splits.
--
-- Descriptive context for Season Match Analysis only — it NEVER touches the
-- readiness colour, the load, or the daily decision. Source is unconstrained on
-- purpose (mirrors player_basketball_match_stats): 'baskethotel' | 'instat' | …
--
-- Applied via mcp apply_migration; committed here per the repo rule that every
-- applied migration is reproducible.

create table if not exists public.basketball_team_match_stats (
  id             uuid primary key default gen_random_uuid(),
  owner_team_id  uuid not null references public.teams(id) on delete cascade,
  match_ref      text not null,                     -- source game id (shared by both sides)
  match_date     date,
  opponent       text,
  is_opponent    boolean not null default false,    -- false = our line, true = opponent's line
  period         text not null default 'game',      -- 'game' | 'q1'..'q4' | 'ot1'..
  -- Team box-score totals (nullable — a missing stat is NULL, never 0).
  points         numeric,
  possessions    numeric,
  fgm numeric, fga numeric,
  tpm numeric, tpa numeric,
  ftm numeric, fta numeric,
  oreb numeric, dreb numeric, reb numeric,
  assists numeric, steals numeric, blocks numeric,
  turnovers numeric, fouls numeric,
  -- Four Factors + efficiency (team level).
  efg_pct numeric, ts_pct numeric, to_pct numeric,
  oreb_pct numeric, dreb_pct numeric, ftf numeric, ppp numeric,
  -- Scoring breakdown.
  points_off_to numeric, second_chance_pts numeric,
  points_in_paint numeric, fastbreak_pts numeric,
  bench_pts numeric,
  -- Lossless catch-all (inbound PPP, shot-zone splits, lineup on/off, …).
  advanced       jsonb not null default '{}'::jsonb,
  stats          jsonb not null default '{}'::jsonb,
  -- Provenance (mandatory — principle #1 of the manifesto).
  source         text not null default 'baskethotel',
  source_ref     text,
  synced_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Idempotent on re-sync: one row per team-side / period / match / source.
  unique (owner_team_id, source, match_ref, is_opponent, period)
);

create index if not exists basketball_team_match_stats_team_date_idx
  on public.basketball_team_match_stats (owner_team_id, match_date);

alter table public.basketball_team_match_stats enable row level security;

-- Reads/writes mirror basketball_game_results: coach/staff/admin of the team.
create policy "basketball_team_match_stats_coach_read" on public.basketball_team_match_stats
for select using (owner_team_id in (select coach_team_ids()) or is_staff());
create policy "basketball_team_match_stats_coach_insert" on public.basketball_team_match_stats
for insert with check (owner_team_id in (select coach_team_ids()) or is_staff());
create policy "basketball_team_match_stats_coach_update" on public.basketball_team_match_stats
for update using (owner_team_id in (select coach_team_ids()) or is_staff())
  with check (owner_team_id in (select coach_team_ids()) or is_staff());

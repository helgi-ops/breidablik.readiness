-- Per-game box scores + team scoring breakdown from the FIBA LiveStats feed, so the
-- shot-chart pull can show a full descriptive read (points/reb/ast/stl/blk/to/+-, points
-- in the paint, fastbreak, second chance) and it survives a re-open. One row per game;
-- both sides live in jsonb (own_/opp_) so this never collides with the InStat/KKI
-- basketball_team_match_stats (no Four-Factors double count).
--
-- Free, public, descriptive — never touches the readiness colour, load, or daily decision.

create table if not exists public.basketball_fiba_games (
  id            uuid primary key default gen_random_uuid(),
  owner_team_id uuid not null references public.teams(id) on delete cascade,
  match_id      text not null,
  match_date    date,
  own_tno       int,
  own_name      text,
  opp_name      text,
  own_totals    jsonb not null default '{}'::jsonb,
  opp_totals    jsonb not null default '{}'::jsonb,
  own_box       jsonb not null default '[]'::jsonb,
  opp_box       jsonb not null default '[]'::jsonb,
  synced_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (owner_team_id, match_id)
);

alter table public.basketball_fiba_games enable row level security;
create policy "basketball_fiba_games_coach_read" on public.basketball_fiba_games
for select using (owner_team_id in (select coach_team_ids()) or is_staff());
create policy "basketball_fiba_games_coach_insert" on public.basketball_fiba_games
for insert with check (owner_team_id in (select coach_team_ids()) or is_staff());
create policy "basketball_fiba_games_coach_update" on public.basketball_fiba_games
for update using (owner_team_id in (select coach_team_ids()) or is_staff())
  with check (owner_team_id in (select coach_team_ids()) or is_staff());

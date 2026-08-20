-- Per-shot data from the FIBA LiveStats (Genius Sports) public feed KKI runs on
-- every game (data/<matchId>/data.json). One row = one shot attempt with its court
-- coordinates. Both sides of a game are stored under the owner (coach's) team, split
-- by is_opponent, so the same pull powers own-player shot charts AND opponent scouting.
--
-- Free, public, descriptive scouting data — it NEVER touches the readiness colour, the
-- load, or the daily decision. Applied via mcp apply_migration; committed here so the
-- migration history is reproducible.

create table if not exists public.basketball_shots (
  id             uuid primary key default gen_random_uuid(),
  owner_team_id  uuid not null references public.teams(id) on delete cascade,
  source         text not null default 'fibalivestats',
  match_id       text not null,                    -- the FIBA LiveStats game id
  match_date     date,
  tno            int not null,                     -- FIBA team number (1 or 2)
  is_opponent    boolean not null default false,   -- false = our team's shot
  team_name      text,
  player_no      int,
  player_pno     int,
  player_name    text,
  shirt_number   text,
  player_id      uuid,                             -- matched to our roster (own side), nullable
  x              numeric,                          -- court coordinates (feed's 0-100 scale)
  y              numeric,
  result         int,                              -- 1 = made, 0 = missed
  action_type    text,                             -- '2pt' | '3pt'
  sub_type       text,                             -- jumpshot | layup | dunk | ...
  period         int,
  action_number  int,                              -- unique event id within the game
  created_at     timestamptz not null default now(),
  synced_at      timestamptz not null default now(),
  unique (owner_team_id, source, match_id, tno, action_number)
);

create index if not exists basketball_shots_team_match_idx
  on public.basketball_shots (owner_team_id, match_id);

alter table public.basketball_shots enable row level security;

-- Reads/writes mirror basketball_team_match_stats: coach/staff/admin of the team.
create policy "basketball_shots_coach_read" on public.basketball_shots
for select using (owner_team_id in (select coach_team_ids()) or is_staff());
create policy "basketball_shots_coach_insert" on public.basketball_shots
for insert with check (owner_team_id in (select coach_team_ids()) or is_staff());
create policy "basketball_shots_coach_update" on public.basketball_shots
for update using (owner_team_id in (select coach_team_ids()) or is_staff())
  with check (owner_team_id in (select coach_team_ids()) or is_staff());
create policy "basketball_shots_coach_delete" on public.basketball_shots
for delete using (owner_team_id in (select coach_team_ids()) or is_staff());

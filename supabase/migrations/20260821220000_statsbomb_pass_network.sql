-- StatsBomb passing network: per-player passing OBV + passer->receiver combinations,
-- from the two StatsBomb OBV CSV exports. Descriptive football data only -- never
-- touches the readiness colour or the daily decision. Keyed by (team_id, match_date);
-- the CSVs carry no coordinates and no date (coach supplies the date at upload).

-- Per-player passing volume + passing OBV, both teams (side = own/opp).
create table if not exists sb_match_player_passing (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  match_date date not null,
  source text not null default 'statsbomb',
  side text not null,
  team_name text,
  player_name text not null,
  player_ref text not null,
  player_id uuid references players(id) on delete set null,
  passes int,
  obv numeric,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, match_date, source, side, player_ref)
);

create index if not exists sb_match_player_passing_team_date_idx on sb_match_player_passing (team_id, match_date);
create index if not exists sb_match_player_passing_player_idx on sb_match_player_passing (player_id);

-- Passer -> receiver combinations (directed edges), both teams (side = own/opp).
create table if not exists sb_pass_combinations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  match_date date not null,
  source text not null default 'statsbomb',
  side text not null,
  team_name text,
  passer_name text not null,
  passer_ref text not null,
  passer_player_id uuid references players(id) on delete set null,
  receiver_name text not null,
  receiver_ref text not null,
  receiver_player_id uuid references players(id) on delete set null,
  passes int,
  obv numeric,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, match_date, source, side, passer_ref, receiver_ref)
);

create index if not exists sb_pass_combinations_team_date_idx on sb_pass_combinations (team_id, match_date);
create index if not exists sb_pass_combinations_passer_idx on sb_pass_combinations (passer_player_id);
create index if not exists sb_pass_combinations_receiver_idx on sb_pass_combinations (receiver_player_id);

alter table sb_match_player_passing enable row level security;
alter table sb_pass_combinations enable row level security;

-- Reads scoped to the owning team (coach/admin/staff of that team); writes service-role only.
drop policy if exists sb_mpp_read on sb_match_player_passing;
create policy sb_mpp_read on sb_match_player_passing for select using (
  team_id in (
    select p.team_id from profiles p where p.id = auth.uid()
    union
    select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()
  )
);
drop policy if exists sb_pc_read on sb_pass_combinations;
create policy sb_pc_read on sb_pass_combinations for select using (
  team_id in (
    select p.team_id from profiles p where p.id = auth.uid()
    union
    select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()
  )
);

-- StatsBomb Phase 0: manual IQ CSV import (no API). Descriptive context only —
-- never touches the readiness colour or the daily decision. Provenance is the
-- point: rows are tagged source='statsbomb' so nothing is mixed with Wyscout.

-- StatsBomb team id → MicroPulse team map (opponents may be name-only, team_id null).
create table if not exists sb_team_map (
  sb_team_id bigint primary key,
  team_id uuid references teams(id) on delete set null,
  sb_name text not null,
  created_at timestamptz not null default now()
);

-- Seed Breiðablik (StatsBomb team id 2041).
insert into sb_team_map (sb_team_id, team_id, sb_name)
values (2041, '94b52a06-0b83-48da-8664-639ec3486a0c', 'Breidablik')
on conflict (sb_team_id) do update set team_id = excluded.team_id, sb_name = excluded.sb_name;

-- Per-team-per-match StatsBomb stats. One row = the club in one match; the
-- against-side (goals_against, xg_against, opp_*) comes from the CSV's Opposition
-- columns in the same row. Promoted coach-facing metrics + full row in raw jsonb.
create table if not exists sb_team_match_stats (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  sb_team_id bigint,
  season text not null,
  match_date date not null,
  game_week int,
  opponent text,
  is_home boolean,
  minutes numeric,
  source text not null default 'statsbomb',
  -- scoring / shooting
  goals numeric, goals_against numeric,
  xg numeric, xg_against numeric, xg_per_shot numeric, open_play_xg numeric,
  shots numeric, shots_against numeric,
  -- passing / progression
  passes numeric, passing_pct numeric, passes_into_box numeric, deep_progressions numeric,
  crosses numeric, box_touches numeric, long_ball_pct numeric,
  possession_proxy_pct numeric,
  -- on-ball value (StatsBomb only)
  obv numeric, pass_obv numeric, shot_obv numeric, carry_obv numeric, def_action_obv numeric, opposition_obv numeric,
  -- pressing (StatsBomb only)
  pressures numeric, counterpressures numeric, pressures_opp_half_pct numeric, aggression numeric,
  -- set pieces (for and against)
  set_piece_xg numeric, set_piece_goals numeric, set_piece_shots numeric,
  xg_per_corner numeric, corner_xg numeric, goals_from_corners numeric, shots_per_corner numeric,
  opp_set_piece_xg numeric, opp_set_piece_goals numeric, opp_goals_from_corners numeric,
  -- goalkeeper / discipline
  gk_long_ball_pct numeric, gk_pass_length numeric,
  yellow_cards numeric, red_cards numeric,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, match_date, source)
);

create index if not exists sb_team_match_stats_team_season_idx on sb_team_match_stats (team_id, season);

alter table sb_team_map enable row level security;
alter table sb_team_match_stats enable row level security;

-- Reads scoped to the owning team (coach/admin/staff of that team); writes are service-role only.
drop policy if exists sb_tms_read on sb_team_match_stats;
create policy sb_tms_read on sb_team_match_stats for select using (
  team_id in (
    select p.team_id from profiles p where p.id = auth.uid()
    union
    select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()
  )
);
drop policy if exists sb_team_map_read on sb_team_map;
create policy sb_team_map_read on sb_team_map for select using (true);

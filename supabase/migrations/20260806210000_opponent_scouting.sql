-- Pre-match Opponent Scouting (Wyscout → MicroPulse). Stores a scouted opponent's
-- OWN full-season profile (team_match_stats only holds your team + your opponents,
-- not an opponent's whole season). Descriptive context only — never touches the
-- readiness colour or the daily decision. RLS-scoped to owner_team_id (a club only
-- sees its own scouting). Applied via mcp apply_migration; committed per repo rule.

create table if not exists public.scout_team_season (
  id uuid primary key default gen_random_uuid(),
  owner_team_id uuid not null,
  opponent_name text not null,
  season text not null,
  source_ref text,
  matches integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- General (season per-match aggregates)
  xgf numeric, xga numeric, gf numeric, ga numeric,
  shots numeric, shots_against numeric, possession numeric,
  ppda numeric, def_duels_won_pct numeric,
  -- Passing / Attacking presets (optional)
  forward_passes numeric, forward_pass_acc_pct numeric,
  passes_final_third numeric, passes_final_third_acc_pct numeric,
  progressive_passes numeric, smart_passes numeric, smart_pass_acc_pct numeric,
  crosses numeric, cross_acc_pct numeric,
  positional_attacks numeric, counterattacks numeric, offensive_duels_won_pct numeric,
  passing jsonb, attacking jsonb,
  unique (owner_team_id, opponent_name, season)
);

create table if not exists public.scout_team_match (
  id uuid primary key default gen_random_uuid(),
  scout_team_season_id uuid not null references public.scout_team_season(id) on delete cascade,
  match_date date,
  opponent text,
  is_home boolean,
  goals numeric, goals_against numeric, xg numeric, xg_against numeric,
  result text
);
create index if not exists idx_scout_team_match_season on public.scout_team_match(scout_team_season_id);

create table if not exists public.scout_player (
  id uuid primary key default gen_random_uuid(),
  scout_team_season_id uuid not null references public.scout_team_season(id) on delete cascade,
  player_name text,
  position text,
  minutes numeric, goals numeric, xg numeric, assists numeric, xa numeric,
  received_passes numeric,
  raw jsonb
);
create index if not exists idx_scout_player_season on public.scout_player(scout_team_season_id);

-- RLS: a coach sees scouting for their own team(s) only; writes are service-role.
alter table public.scout_team_season enable row level security;
alter table public.scout_team_match enable row level security;
alter table public.scout_player enable row level security;

create policy scout_season_read on public.scout_team_season for select using (
  owner_team_id = (select team_id from public.profiles where id = auth.uid())
  or exists (select 1 from public.coach_teams ct where ct.coach_id = auth.uid() and ct.team_id = owner_team_id)
);
create policy scout_match_read on public.scout_team_match for select using (
  exists (
    select 1 from public.scout_team_season s
    where s.id = scout_team_season_id and (
      s.owner_team_id = (select team_id from public.profiles where id = auth.uid())
      or exists (select 1 from public.coach_teams ct where ct.coach_id = auth.uid() and ct.team_id = s.owner_team_id)
    )
  )
);
create policy scout_player_read on public.scout_player for select using (
  exists (
    select 1 from public.scout_team_season s
    where s.id = scout_team_season_id and (
      s.owner_team_id = (select team_id from public.profiles where id = auth.uid())
      or exists (select 1 from public.coach_teams ct where ct.coach_id = auth.uid() and ct.team_id = s.owner_team_id)
    )
  )
);

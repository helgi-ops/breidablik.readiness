-- Basketball Opponent Scouting — stores a scouted opponent's OWN full-season box
-- scores, pulled for free from the public KKÍ (baskethotel) widget or uploaded from
-- Instat/Hudl. Own-team stats (player_basketball_match_stats) only hold your team;
-- this holds the opponent's whole season so we can profile them and their players.
-- Descriptive scouting context only — never touches the readiness colour or the daily
-- decision. RLS-scoped to owner_team_id (a club only sees its own scouting). Applied
-- via mcp apply_migration; committed per repo rule.
create table if not exists public.scout_basketball_season (
  id uuid primary key default gen_random_uuid(),
  owner_team_id uuid not null,
  opponent_name text not null,
  season text not null,
  season_id text,                 -- KKÍ season id used for the pull (nullable for uploads)
  source text not null default 'baskethotel',
  games integer,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_team_id, opponent_name, season)
);

create table if not exists public.scout_basketball_player_game (
  id uuid primary key default gen_random_uuid(),
  scout_season_id uuid not null references public.scout_basketball_season(id) on delete cascade,
  game_id text,
  game_date date,
  opponent text,                  -- who the scouted team played that game
  home_away text,
  player_name text,
  player_ref text,
  minutes numeric, points numeric,
  fgm numeric, fga numeric, tpm numeric, tpa numeric, ftm numeric, fta numeric,
  oreb numeric, dreb numeric, reb numeric, assists numeric, steals numeric,
  blocks numeric, turnovers numeric, fouls numeric, plus_minus numeric, efficiency numeric,
  stats jsonb,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists idx_scout_bb_player_game_season on public.scout_basketball_player_game(scout_season_id);

alter table public.scout_basketball_season enable row level security;
alter table public.scout_basketball_player_game enable row level security;

-- Read: a coach sees scouting for their own team(s) only. Writes are service-role.
create policy scout_bb_season_read on public.scout_basketball_season for select using (
  owner_team_id = (select team_id from public.profiles where id = auth.uid())
  or exists (select 1 from public.coach_teams ct where ct.coach_id = auth.uid() and ct.team_id = owner_team_id)
);
create policy scout_bb_player_read on public.scout_basketball_player_game for select using (
  exists (
    select 1 from public.scout_basketball_season s
    where s.id = scout_season_id and (
      s.owner_team_id = (select team_id from public.profiles where id = auth.uid())
      or exists (select 1 from public.coach_teams ct where ct.coach_id = auth.uid() and ct.team_id = s.owner_team_id)
    )
  )
);

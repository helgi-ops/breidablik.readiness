-- Basketball per-game box-score ingestion (KKÍ / baskethotel or any clean feed).
-- Descriptive stats only — NEVER touches the readiness verdict or the daily
-- decision. Per-game rows land here; a season rollup (per-game averages) is
-- written to player_season_stats (source='baskethotel') so the existing
-- sport-aware surfaces render it with zero extra wiring.

create table if not exists public.player_basketball_match_stats (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  player_id     uuid references public.players(id) on delete set null, -- null until name-matched
  game_id       text not null,            -- source game id (also source_ref)
  game_date     date,
  opponent      text,
  home_away     text check (home_away in ('home','away')),
  -- Core box score (nullable — a missing stat is NULL, never 0).
  minutes       numeric,
  points        numeric,
  fgm           numeric, fga numeric,
  tpm           numeric, tpa numeric,
  ftm           numeric, fta numeric,
  oreb          numeric, dreb numeric, reb numeric,
  assists       numeric,
  steals        numeric,
  blocks        numeric,
  turnovers     numeric,
  fouls         numeric,
  plus_minus    numeric,
  efficiency    numeric,
  -- Full raw box-score row, so nothing the feed reports is ever lost.
  stats         jsonb not null default '{}'::jsonb,
  -- Provenance (mandatory — principle #1 of the manifesto).
  source            text not null default 'baskethotel',
  source_ref        text,                 -- game id / feed reference
  source_player_ref text not null,        -- stable per-source player id
  source_player_name text not null,       -- raw display name (for mapping review)
  synced_at         timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  -- One row per (team, game, player), idempotent on re-sync.
  unique (team_id, source, game_id, source_player_ref)
);

create index if not exists idx_bball_match_team_date on public.player_basketball_match_stats (team_id, game_date);
create index if not exists idx_bball_match_player on public.player_basketball_match_stats (player_id);

alter table public.player_basketball_match_stats enable row level security;

-- Reads mirror player_season_stats exactly. Writes are service-role only
-- (the sync uses the admin client; RLS has no insert/update/delete policy).
create policy player_basketball_match_stats_coach_read_team
  on public.player_basketball_match_stats for select
  using (exists (
    select 1 from public.profiles pr
    where pr.id = auth.uid()
      and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
      and (lower(coalesce(pr.role, '')) = 'admin'
        or pr.team_id = player_basketball_match_stats.team_id
        or player_basketball_match_stats.team_id in (
          select ct.team_id from public.coach_teams ct where ct.coach_id = auth.uid()))
  ));

create policy player_basketball_match_stats_player_select_own
  on public.player_basketball_match_stats for select
  using (
    player_id is not null and (
      exists (select 1 from public.players p where p.id = player_basketball_match_stats.player_id and p.user_id = auth.uid())
      or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.player_id = player_basketball_match_stats.player_id)
    )
  );

-- Config: let a team be configured for the basketball feed. Reuses the existing
-- stat_ingestion_config; add the source value + a generic external team ref.
alter table public.stat_ingestion_config drop constraint if exists stat_ingestion_config_source_check;
alter table public.stat_ingestion_config add constraint stat_ingestion_config_source_check
  check (source = any (array['excel','wyscout_api','baskethotel']));
alter table public.stat_ingestion_config add column if not exists basketball_team_ref text;

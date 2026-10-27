-- InStat opponent season export (Games/Players/Lineups) is pre-aggregated, so it does
-- not fit the per-player-game scout_basketball_player_game table the KKÍ pull writes.
-- Store the parsed opponent payload (team game log + player season averages + lineups)
-- as JSON on the season header for source='instat'. Descriptive scouting only.
alter table public.scout_basketball_season
  add column if not exists payload jsonb;

comment on column public.scout_basketball_season.payload is
  'InStat season export payload for source=instat: { teamGames, players, lineups }. Null for KKÍ pulls (those use scout_basketball_player_game).';

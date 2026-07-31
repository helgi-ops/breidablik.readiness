-- Allow the basketball season rollup to be stored in player_season_stats with
-- its own provenance tag (source='baskethotel'), so the existing sport-aware
-- surfaces render it. (player_match_stats stays football-only — basketball
-- per-game rows live in player_basketball_match_stats.)
alter table public.player_season_stats drop constraint if exists player_season_stats_source_check;
alter table public.player_season_stats add constraint player_season_stats_source_check
  check (source = any (array['wyscout_excel','wyscout_api','manual','baskethotel']));

-- player_match_stats.source CHECK was never widened past the original Wyscout set,
-- so ANY StatsBomb per-match write (the existing Player-Match CSV path, and the new
-- Match Report PDF adapter) is rejected. Widen it to the full StatSource set + the new
-- 'statsbomb_match_report' tag. Mirrors 20260807220000_player_season_stats_allow_statsbomb_csv.
alter table player_match_stats drop constraint if exists player_match_stats_source_check;
alter table player_match_stats add constraint player_match_stats_source_check
  check (source = any (array['wyscout_excel','wyscout_api','manual','baskethotel','statsbomb_csv','statsbomb_match_report']));

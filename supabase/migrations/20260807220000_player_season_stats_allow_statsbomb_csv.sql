-- The StatsBomb Squad ingestion emits source='statsbomb_csv' (added to the TS StatSource
-- type in 4f9f1dc) but the DB check constraint was never widened, so any StatsBomb squad
-- import fails. Allow it.
alter table player_season_stats drop constraint if exists player_season_stats_source_check;
alter table player_season_stats add constraint player_season_stats_source_check
  check (source = any (array['wyscout_excel','wyscout_api','manual','baskethotel','statsbomb_csv']));

-- Register 'instat' as a first-class ingestion source. InStat/Hudl is a SOURCE,
-- not a new surface: its rows coexist with baskethotel under the existing
-- (team, source, game, player) unique keys, and box-score baskethotel stays the
-- canonical KKÍ feed. The per-game basketball stores already leave `source`
-- unconstrained, so 'instat' works there with no change — only these two CHECK
-- constraints (config + the season rollup) need widening, additively.
--
-- Applied via mcp apply_migration; committed here per the repo rule that every
-- applied migration is reproducible.

-- A team can be configured for the InStat feed.
alter table public.stat_ingestion_config drop constraint if exists stat_ingestion_config_source_check;
alter table public.stat_ingestion_config add constraint stat_ingestion_config_source_check
  check (source = any (array['excel','wyscout_api','baskethotel','instat']));

-- The basketball season rollup lands in player_season_stats; allow the InStat rollup.
alter table public.player_season_stats drop constraint if exists player_season_stats_source_check;
alter table public.player_season_stats add constraint player_season_stats_source_check
  check (source = any (array['wyscout_excel','wyscout_api','manual','baskethotel','statsbomb_csv','instat']));

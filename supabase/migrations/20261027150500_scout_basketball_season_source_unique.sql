-- A coach may hold BOTH a free KKÍ pull and an uploaded InStat season export for the
-- same opponent+season and toggle between them (availableSources / seasonSourcesFor
-- already assume two rows). The old unique key (team, opponent, season) forced a single
-- row per opponent+season, so the two sources overwrote each other. Widen the key to
-- include source so they coexist.
alter table public.scout_basketball_season
  drop constraint if exists scout_basketball_season_owner_team_id_opponent_name_season_key;

-- Backfill any null source to the KKÍ default before the new key (defensive; all
-- existing rows already carry a source).
update public.scout_basketball_season set source = 'baskethotel' where source is null;

alter table public.scout_basketball_season
  add constraint scout_basketball_season_owner_opponent_season_source_key
  unique (owner_team_id, opponent_name, season, source);

-- Basketball advanced metrics — the descriptive layer an InStat/Hudl-grade feed
-- carries beyond the KKÍ box score (Four Factors + tracking metrics). Every column
-- is NULLABLE: a missing metric is NULL, never 0, and the baskethotel feed simply
-- leaves them null. Purely descriptive — these NEVER touch the readiness colour,
-- the load, or the daily decision; they surface only in Season Match Analysis.
--
-- Added to BOTH per-game stores so own-team (player_basketball_match_stats) and
-- opponent scouting (scout_basketball_player_game) share one shape. The `advanced`
-- jsonb is the lossless catch-all for anything the feed reports that has no column
-- yet (shot-zone splits, inbound PPP (PPSLOB/PPBLOB), lineup on/off, VPS, …).
--
-- Applied via mcp apply_migration; committed here per the repo rule that every
-- applied migration is reproducible.

do $$
declare
  t text;
begin
  foreach t in array array[
    'public.player_basketball_match_stats',
    'public.scout_basketball_player_game'
  ]
  loop
    -- Four Factors + shooting efficiency
    execute format('alter table %s add column if not exists efg_pct numeric', t);   -- effective FG%
    execute format('alter table %s add column if not exists ts_pct numeric', t);    -- true shooting%
    execute format('alter table %s add column if not exists to_pct numeric', t);    -- turnover%
    execute format('alter table %s add column if not exists oreb_pct numeric', t);  -- offensive rebound%
    execute format('alter table %s add column if not exists dreb_pct numeric', t);  -- defensive rebound%
    execute format('alter table %s add column if not exists ftf numeric', t);       -- free-throw factor (FTM/FGA)
    execute format('alter table %s add column if not exists ppp numeric', t);       -- points per possession
    -- Scoring breakdown
    execute format('alter table %s add column if not exists points_off_to numeric', t);
    execute format('alter table %s add column if not exists second_chance_pts numeric', t);
    execute format('alter table %s add column if not exists points_in_paint numeric', t);
    execute format('alter table %s add column if not exists fastbreak_pts numeric', t);
    -- Effort / playmaking
    execute format('alter table %s add column if not exists deflections numeric', t);
    execute format('alter table %s add column if not exists charges_drawn numeric', t);
    execute format('alter table %s add column if not exists usage_pct numeric', t);
    execute format('alter table %s add column if not exists ast_pct numeric', t);
    execute format('alter table %s add column if not exists ast_to_ratio numeric', t);
    -- Lossless catch-all for anything without its own column yet.
    execute format('alter table %s add column if not exists advanced jsonb not null default ''{}''::jsonb', t);
  end loop;
end $$;

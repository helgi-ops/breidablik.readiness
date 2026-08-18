-- A few more sb_team_match_stats columns the StatsBomb TEAM-level "Match Stats" export carries:
--   • long_balls        — total long balls (the per-player "LB" column, which is Long Balls, not
--                          line breaks — corrected here); pressured/unpressured split already exist.
--   • aggressive_actions — count of aggressive defensive actions (distinct from `aggression`, a rate).
--   • dribble_pct        — dribble success % (successful ÷ attempted), authoritative from the team file
--                          (the per-player file lacks attempts, so it can't be derived there).
-- All nullable numeric; no backfill. Descriptive football context — never touches readiness.

alter table public.sb_team_match_stats
  add column if not exists long_balls          numeric,
  add column if not exists aggressive_actions  numeric,
  add column if not exists dribble_pct         numeric;

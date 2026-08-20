-- Play-by-play-derived summaries for a FIBA LiveStats game: the assist network
-- (passer->scorer, from assist.previousAction -> the made shot) and shot context
-- (share of made FGs in the paint / on the break / off turnovers / second chance,
-- from the event qualifiers). Stored per side alongside the box in basketball_fiba_games.
-- Descriptive — never touches the readiness colour, load, or daily decision.

alter table public.basketball_fiba_games
  add column if not exists own_pbp jsonb not null default '{}'::jsonb,
  add column if not exists opp_pbp jsonb not null default '{}'::jsonb;

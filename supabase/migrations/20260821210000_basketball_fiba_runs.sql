-- Store the per-game scoring-run analysis (both teams) from the FIBA LiveStats
-- play-by-play so cross-game run-trend correlation is one query, not N feed fetches.
-- Descriptive only; never touches the readiness colour, load, or daily decision.
alter table public.basketball_fiba_games
  add column if not exists runs jsonb not null default '{}'::jsonb;

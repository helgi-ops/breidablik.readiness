-- Add minimum match minutes filter to team_load_targets.
-- When computing match demand averages, only match-day rows where the player
-- played at least this many minutes are included. Default 75 min ≈ "FULL" tag.

ALTER TABLE public.team_load_targets
  ADD COLUMN IF NOT EXISTS match_demand_min_minutes integer NOT NULL DEFAULT 75;

ALTER TABLE public.team_load_targets
  ADD CONSTRAINT team_load_targets_min_minutes_range
  CHECK (match_demand_min_minutes >= 0 AND match_demand_min_minutes <= 120);

COMMENT ON COLUMN public.team_load_targets.match_demand_min_minutes IS
  'Minimum minutes played in a match for a player row to be included when computing match demand averages. Default 75 ≈ "FULL" game.';

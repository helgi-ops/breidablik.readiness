-- Add a Player-Load-based match detection threshold used when the team is
-- in indoor mode. Total Distance is ~0 for indoor sessions (no GPS), so the
-- existing TD-based fallback in findRecentMatchDates cannot find indoor
-- matches when the coach has not marked them in week_plans / schedule.
--
-- Typical indoor match Player Load: 550–850 (full 90-min squad average).
-- Typical indoor training session:  250–500.
-- Default threshold of 550 puts the boundary roughly where it should be
-- and the coach can override it in the settings modal.

ALTER TABLE public.team_load_targets
  ADD COLUMN IF NOT EXISTS match_day_detection_min_player_load integer NOT NULL DEFAULT 550;

ALTER TABLE public.team_load_targets
  DROP CONSTRAINT IF EXISTS team_load_targets_min_pl_range;
ALTER TABLE public.team_load_targets
  ADD CONSTRAINT team_load_targets_min_pl_range
  CHECK (match_day_detection_min_player_load >= 0 AND match_day_detection_min_player_load <= 2000);

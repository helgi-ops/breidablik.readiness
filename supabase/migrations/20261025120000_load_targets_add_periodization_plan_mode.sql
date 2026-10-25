-- Weekly-load target mode #4: periodization_plan — pull the current week's per-KPI target from the
-- team's own season plan (pre-season ramp / in-season volume / off-season maintenance), so the live
-- Weekly Load tracker measures the running week against what the coach planned in the Periodization Hub.
ALTER TABLE public.team_load_targets DROP CONSTRAINT IF EXISTS team_load_targets_mode_check;
ALTER TABLE public.team_load_targets ADD CONSTRAINT team_load_targets_mode_check
  CHECK (mode IN ('baseline', 'match_demand', 'coach_weekly', 'periodization_plan'));
COMMENT ON COLUMN public.team_load_targets.mode IS
  'Target computation mode: baseline (historical rolling), match_demand (match averages + MD template), coach_weekly (hand-set), or periodization_plan (the team''s own season plan for the current week).';

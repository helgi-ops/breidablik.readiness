-- Add an optional qualitative pitch-stimulus label to drill_library.
--
-- The session builder classifies a drill's stimulus (mechanical / locomotive / mixed / technical) from
-- its GPS metrics (classifyDrillStimulus on vel_b5/b6 + accel/decel B2-3). Drills added WITHOUT GPS
-- (e.g. read from a video or added by hand) therefore had no stimulus and dropped out of stimulus-aware
-- day planning. This column lets the AI video read — or the coach — set that label directly. It is a
-- FALLBACK only: when GPS metrics exist, the metric-based classification still wins. Descriptive /
-- advisory — never the readiness colour or the daily decision.
ALTER TABLE public.drill_library ADD COLUMN IF NOT EXISTS stimulus_type text;

ALTER TABLE public.drill_library DROP CONSTRAINT IF EXISTS drill_library_stimulus_type_chk;
ALTER TABLE public.drill_library ADD CONSTRAINT drill_library_stimulus_type_chk
  CHECK (stimulus_type IS NULL OR stimulus_type IN ('mechanical', 'locomotive', 'mixed', 'technical'));

COMMENT ON COLUMN public.drill_library.stimulus_type IS
  'Optional qualitative pitch-stimulus label (AI video read or coach-set). Fallback for the session builder when GPS metrics are absent; metric-based classifyDrillStimulus wins when metrics exist.';

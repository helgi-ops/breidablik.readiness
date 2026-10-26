-- Mark a fixture as a pre-season friendly / training game. Friendlies do NOT start the competitive
-- season: detectSeasonPhases takes the pre-season → competitive boundary from the first NON-friendly
-- fixture, so a friendly added to anchor MD structure in pre-season no longer ends pre-season early.
ALTER TABLE public.match_schedule ADD COLUMN IF NOT EXISTS is_friendly boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.match_schedule.is_friendly IS
  'True for a pre-season friendly / training game. Friendlies do NOT start the competitive season (detectSeasonPhases takes the pre-season boundary from the first non-friendly fixture).';

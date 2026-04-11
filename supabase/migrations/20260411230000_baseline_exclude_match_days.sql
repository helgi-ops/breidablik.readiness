-- Baseline "typical week" rolling average: option to exclude detected match days.
--
-- Indoor teams that play regular 90-minute matches indoors see their weekly
-- totals significantly skewed by match days (a match ≈ 2-3× a training load).
-- With this flag on, the tracker filters detected match dates out of the
-- historical rollup used to compute the `typicalWeekTotal` baseline, so the
-- baseline represents a clean "typical training week" instead of a blended
-- training+match average.
--
-- Defaults to `false` to preserve existing behavior for current teams.
-- Coaches can enable it per team from the Load Target settings modal.

ALTER TABLE public.team_load_targets
  ADD COLUMN IF NOT EXISTS baseline_exclude_match_days boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.team_load_targets.baseline_exclude_match_days IS
  'When true, the baseline "typical week" rolling average excludes detected match days so that the baseline represents a typical training week only. Recommended for indoor teams where a 90-min match significantly skews weekly totals.';

-- The bulk Catapult-CSV upload route uses
--   .upsert(rows, { onConflict: "team_id,source,source_athlete_id" })
-- to register newly-mapped athlete aliases, but the matching unique
-- constraint was never created. Postgres rejected the first
-- Afturedling upload attempt 2026-05-02 with:
--   "no unique or exclusion constraint matching the ON CONFLICT specification"
-- This adds the missing constraint. Verified zero existing duplicates
-- before applying, so safe to run on prod data.

ALTER TABLE public.external_athlete_aliases
  ADD CONSTRAINT external_athlete_aliases_team_source_athlete_uniq
  UNIQUE (team_id, source, source_athlete_id);

COMMENT ON CONSTRAINT external_athlete_aliases_team_source_athlete_uniq
  ON public.external_athlete_aliases IS
  'Required for ON CONFLICT(team_id,source,source_athlete_id) used by /api/coach/external-load/upload bulk commit.';

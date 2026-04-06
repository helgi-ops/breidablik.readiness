-- Add sore_areas column to readiness_entries for granular muscle-group soreness tracking
-- Stored as a JSONB array of muscle-group IDs, e.g. ["hamstrings", "lower_back"]

ALTER TABLE readiness_entries
  ADD COLUMN IF NOT EXISTS sore_areas jsonb DEFAULT NULL;

COMMENT ON COLUMN readiness_entries.sore_areas
  IS 'Array of muscle-group IDs the player marked as sore/stiff during check-in';

-- Also ensure notes column exists (was previously added ad-hoc)
ALTER TABLE readiness_entries
  ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;

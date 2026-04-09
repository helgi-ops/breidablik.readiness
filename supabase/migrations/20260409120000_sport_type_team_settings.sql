-- ============================================================================
-- Add sport_type to team_settings
-- ============================================================================
-- Allows each team to declare its sport (football | basketball).
-- The decision engine uses this to select the correct signal weights:
--   football outdoor → GPS weights (HIR, Decel, Density, MaxVel, Band6)
--   football indoor  → FMP weights (DynHigh, PL, IMA, DynMed, RunHigh)
--   basketball       → Basketball weights (PL, IMA, DynHigh, JumpLoad, DynMed)
--
-- Basketball teams are automatically indoor_mode = true.
-- ============================================================================

ALTER TABLE team_settings
  ADD COLUMN IF NOT EXISTS sport_type text NOT NULL DEFAULT 'football';

COMMENT ON COLUMN team_settings.sport_type IS 'Sport type for this team: football | basketball. Determines signal weights for burden score.';

-- Update Breiðablik explicitly (already football, but be explicit)
UPDATE team_settings
SET sport_type = 'football'
WHERE team_id = '94b52a06-0b83-48da-8664-639ec3486a0c';

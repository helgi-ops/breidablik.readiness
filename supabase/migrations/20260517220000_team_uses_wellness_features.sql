-- ============================================================================
-- Operating mode: Full Suite vs GPS Intelligence Only
-- ============================================================================
-- Adds a per-team flag that gates the wellness side of MicroPulse so a team
-- can run as GPS/IMA-only without check-ins, RPE, decision card, or wellness
-- notifications. This opens a new market segment (clubs using Catapult or
-- STATSports that don't want daily wellness surveys) while keeping the full
-- product unchanged for existing teams.
--
-- Default is TRUE for backwards compatibility — every existing team stays on
-- the Full Suite until the head coach explicitly opts into GPS-only via
-- Settings → Operating Mode.
-- ============================================================================

ALTER TABLE team_settings
  ADD COLUMN IF NOT EXISTS uses_wellness_features boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN team_settings.uses_wellness_features IS
  'When false, the team runs in GPS Intelligence Only mode: '
  'check-ins, RPE, wearables, decision card, and wellness notifications are '
  'hidden. GPS, IMA, sprint, decel, and external-load intelligence remain '
  'fully available. Default true preserves the Full Suite experience for '
  'existing teams.';

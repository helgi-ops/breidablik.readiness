-- Add Catapult integration credentials to team_settings
-- Allows each team to connect their own Catapult org independently.

ALTER TABLE team_settings
  ADD COLUMN IF NOT EXISTS catapult_api_key  text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS catapult_org_id   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS catapult_api_base text DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN team_settings.catapult_api_key  IS 'Catapult OpenField API bearer token (JWT)';
COMMENT ON COLUMN team_settings.catapult_org_id   IS 'Catapult organization numeric ID';
COMMENT ON COLUMN team_settings.catapult_api_base IS 'Catapult API base URL (defaults to EU endpoint if null)';

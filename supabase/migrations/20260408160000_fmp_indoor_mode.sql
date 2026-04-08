-- ============================================================================
-- Football Movement Profile (FMP) + Indoor Mode
-- ============================================================================
-- Adds FMP columns to player_external_load_daily (inertial-sensor-based,
-- works indoors without GPS) and creates team_settings table with indoor_mode.
--
-- FMP 6 Categories (Catapult inertial classification):
--   Very Low Intensity     — standing/stationary
--   Low Intensity          — walking
--   Running Medium Intensity — jogging/curved running
--   Running High Intensity — running/sprinting (linear high speed)
--   Dynamic Medium Intensity — moderate COD/accel/decel
--   Dynamic High Intensity — sharp COD/accel/decel
-- ============================================================================

-- ── 1. FMP columns on player_external_load_daily ─────────────────────────────

ALTER TABLE player_external_load_daily
  ADD COLUMN IF NOT EXISTS fmp_very_low_s            real,
  ADD COLUMN IF NOT EXISTS fmp_low_intensity_s       real,
  ADD COLUMN IF NOT EXISTS fmp_running_medium_s      real,
  ADD COLUMN IF NOT EXISTS fmp_running_high_s        real,
  ADD COLUMN IF NOT EXISTS fmp_dynamic_low_s         real,
  ADD COLUMN IF NOT EXISTS fmp_dynamic_medium_s      real,
  ADD COLUMN IF NOT EXISTS fmp_dynamic_high_s        real,
  ADD COLUMN IF NOT EXISTS fmp_total_duration_s      real,
  ADD COLUMN IF NOT EXISTS fmp_dynamic_medium_pct    real,
  ADD COLUMN IF NOT EXISTS fmp_dynamic_high_pct      real,
  ADD COLUMN IF NOT EXISTS fmp_running_high_pct      real;

COMMENT ON COLUMN player_external_load_daily.fmp_very_low_s         IS 'FMP: seconds in Very Low Intensity (standing/stationary)';
COMMENT ON COLUMN player_external_load_daily.fmp_low_intensity_s    IS 'FMP: seconds in Low Intensity (walking)';
COMMENT ON COLUMN player_external_load_daily.fmp_running_medium_s   IS 'FMP: seconds in Running Medium Intensity (jogging/curved)';
COMMENT ON COLUMN player_external_load_daily.fmp_running_high_s     IS 'FMP: seconds in Running High Intensity (running/sprinting)';
COMMENT ON COLUMN player_external_load_daily.fmp_dynamic_low_s      IS 'FMP: seconds in Dynamic Low Intensity';
COMMENT ON COLUMN player_external_load_daily.fmp_dynamic_medium_s   IS 'FMP: seconds in Dynamic Medium Intensity (moderate COD/accel/decel)';
COMMENT ON COLUMN player_external_load_daily.fmp_dynamic_high_s     IS 'FMP: seconds in Dynamic High Intensity (sharp COD/accel/decel)';
COMMENT ON COLUMN player_external_load_daily.fmp_total_duration_s   IS 'FMP: total tracked duration (seconds)';
COMMENT ON COLUMN player_external_load_daily.fmp_dynamic_medium_pct IS 'FMP: % of session in Dynamic Medium Intensity';
COMMENT ON COLUMN player_external_load_daily.fmp_dynamic_high_pct   IS 'FMP: % of session in Dynamic High Intensity';
COMMENT ON COLUMN player_external_load_daily.fmp_running_high_pct   IS 'FMP: % of session in Running High Intensity';

-- ── 2. team_settings table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS team_settings (
  team_id        uuid PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  indoor_mode    boolean NOT NULL DEFAULT false,
  notes          text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid
);

COMMENT ON TABLE  team_settings IS 'Per-team configuration flags (indoor mode, etc.)';
COMMENT ON COLUMN team_settings.indoor_mode IS 'When true, use FMP + PlayerLoad + IMA instead of GPS metrics for load monitoring';

-- Enable RLS
ALTER TABLE team_settings ENABLE ROW LEVEL SECURITY;

-- Coaches and admins can read/write their team settings
CREATE POLICY "team_settings_authenticated_read"
  ON team_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "team_settings_authenticated_write"
  ON team_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Service role full access
CREATE POLICY "team_settings_service_role"
  ON team_settings FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 3. Seed Breiðablik default (outdoor, GPS available) ──────────────────────

INSERT INTO team_settings (team_id, indoor_mode, notes)
VALUES ('94b52a06-0b83-48da-8664-639ec3486a0c', false, 'Breiðablik — GPS/Catapult outdoor')
ON CONFLICT (team_id) DO NOTHING;

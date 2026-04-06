-- STATSports athlete mapping table (mirrors catapult_athlete_map pattern)
CREATE TABLE IF NOT EXISTS statsport_athlete_map (
  statsport_athlete_id TEXT PRIMARY KEY,
  micropulse_player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  statsport_athlete_name TEXT,
  statsport_email TEXT,
  match_method TEXT NOT NULL DEFAULT 'manual'
    CHECK (match_method IN ('manual', 'email', 'name')),
  confidence NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_statsport_athlete_map_player
  ON statsport_athlete_map (micropulse_player_id, statsport_athlete_id);

-- Enable RLS
ALTER TABLE statsport_athlete_map ENABLE ROW LEVEL SECURITY;

-- Coach/admin/staff can read/write athlete mappings
CREATE POLICY "coach_statsport_athlete_map" ON statsport_athlete_map
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND UPPER(p.role) IN ('COACH', 'ADMIN', 'STAFF')
    )
  );

-- Add team GPS provider column (teams can choose 'catapult' or 'statsport')
-- This lets the UI know which sync button to show.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'gps_provider'
  ) THEN
    ALTER TABLE teams ADD COLUMN gps_provider TEXT DEFAULT 'catapult'
      CHECK (gps_provider IN ('catapult', 'statsport', 'none'));
  END IF;
END $$;

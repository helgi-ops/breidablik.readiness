-- Publishing fields for saved_sessions so players can see today's session on team page.
ALTER TABLE saved_sessions
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS session_date date,
  ADD COLUMN IF NOT EXISTS focus_points text[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_saved_sessions_team_published
  ON saved_sessions (team_id, session_date)
  WHERE published_at IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE saved_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_sessions_team_read_published ON saved_sessions;
CREATE POLICY saved_sessions_team_read_published
  ON saved_sessions
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND published_at IS NOT NULL
    AND team_id IN (SELECT team_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS saved_sessions_staff_all ON saved_sessions;
CREATE POLICY saved_sessions_staff_all
  ON saved_sessions
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM profiles
      WHERE id = auth.uid()
        AND upper(coalesce(role, '')) IN ('COACH','ADMIN','STAFF')
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM profiles
      WHERE id = auth.uid()
        AND upper(coalesce(role, '')) IN ('COACH','ADMIN','STAFF')
    )
  );

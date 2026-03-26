-- Add RLS policies for vald_forcedecks_results and vald_nordbord_results.
-- These tables had RLS enabled but no policies, so browser-client queries
-- returned empty results for all users (including players viewing their own data).

-- ── ForceDecks ────────────────────────────────────────────────────────────────

CREATE POLICY IF NOT EXISTS "vald_forcedecks_player_select_own" ON vald_forcedecks_results
  FOR SELECT USING (
    (EXISTS (SELECT 1 FROM players p WHERE p.id = vald_forcedecks_results.microplayer_id AND p.user_id = auth.uid()))
    OR
    (EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.player_id = vald_forcedecks_results.microplayer_id))
  );

CREATE POLICY IF NOT EXISTS "vald_forcedecks_coach_read_team" ON vald_forcedecks_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND lower(COALESCE(pr.role, '')) = ANY (ARRAY['coach','admin','staff'])
        AND (lower(COALESCE(pr.role, '')) = 'admin' OR pr.team_id = vald_forcedecks_results.team_id)
    )
  );

-- ── NordBord ──────────────────────────────────────────────────────────────────

CREATE POLICY IF NOT EXISTS "vald_nordbord_player_select_own" ON vald_nordbord_results
  FOR SELECT USING (
    (EXISTS (SELECT 1 FROM players p WHERE p.id = vald_nordbord_results.microplayer_id AND p.user_id = auth.uid()))
    OR
    (EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.player_id = vald_nordbord_results.microplayer_id))
  );

CREATE POLICY IF NOT EXISTS "vald_nordbord_coach_read_team" ON vald_nordbord_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid()
        AND lower(COALESCE(pr.role, '')) = ANY (ARRAY['coach','admin','staff'])
        AND (lower(COALESCE(pr.role, '')) = 'admin' OR pr.team_id = vald_nordbord_results.team_id)
    )
  );

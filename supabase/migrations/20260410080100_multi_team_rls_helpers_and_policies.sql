-- ============================================================================
-- Multi-team RLS: helper function + new access policies
-- ----------------------------------------------------------------------------
-- Adds a single helper `player_accessible_to_current_coach(player_id)` that
-- encapsulates membership + grant logic, and uses it in new SELECT/INSERT
-- policies on the load tables. Existing single-team policies stay in place;
-- the new policies simply expand access so a player's load is visible to ANY
-- team that has an active membership/grant for that player.
-- ============================================================================

-- 1) Access helper -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.player_accessible_to_current_coach(p_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
        FROM public.player_team_memberships m
       WHERE m.player_id = p_player_id
         AND m.status = 'active'
         AND m.valid_from <= CURRENT_DATE
         AND (m.valid_to IS NULL OR m.valid_to >= CURRENT_DATE)
         AND m.team_id IN (SELECT public.coach_team_ids())
    )
    OR
    EXISTS (
      SELECT 1
        FROM public.player_data_grants g
       WHERE g.player_id = p_player_id
         AND g.status = 'active'
         AND g.valid_from <= now()
         AND (g.valid_to IS NULL OR g.valid_to >= now())
         AND g.granted_to_team_id IN (SELECT public.coach_team_ids())
    );
$$;

COMMENT ON FUNCTION public.player_accessible_to_current_coach(uuid) IS
  'Returns true if the current authenticated coach/staff has access to a given player via an active team membership OR an active data grant. Used as the unified check in multi-team RLS policies.';

GRANT EXECUTE ON FUNCTION public.player_accessible_to_current_coach(uuid) TO authenticated;

-- 2) Additive SELECT policies on load tables ---------------------------------
DROP POLICY IF EXISTS multi_team_coach_read ON public.player_session_rpe;
CREATE POLICY multi_team_coach_read ON public.player_session_rpe
  FOR SELECT TO authenticated
  USING (public.player_accessible_to_current_coach(player_id));

DROP POLICY IF EXISTS multi_team_coach_read ON public.session_rpe_entries;
CREATE POLICY multi_team_coach_read ON public.session_rpe_entries
  FOR SELECT TO authenticated
  USING (public.player_accessible_to_current_coach(player_id));

DROP POLICY IF EXISTS multi_team_coach_read ON public.player_external_load_daily;
CREATE POLICY multi_team_coach_read ON public.player_external_load_daily
  FOR SELECT TO authenticated
  USING (public.player_accessible_to_current_coach(player_id));

DROP POLICY IF EXISTS multi_team_coach_read ON public.player_injuries;
CREATE POLICY multi_team_coach_read ON public.player_injuries
  FOR SELECT TO authenticated
  USING (public.player_accessible_to_current_coach(player_id));

-- 3) INSERT policies ---------------------------------------------------------
-- A coach can insert for a player they have access to, but source_team_id
-- MUST be one of their coached teams (prevents national team from writing
-- data "as" the club team).
DROP POLICY IF EXISTS multi_team_coach_insert ON public.player_session_rpe;
CREATE POLICY multi_team_coach_insert ON public.player_session_rpe
  FOR INSERT TO authenticated
  WITH CHECK (
    public.player_accessible_to_current_coach(player_id)
    AND source_team_id IN (SELECT public.coach_team_ids())
  );

DROP POLICY IF EXISTS multi_team_coach_insert ON public.session_rpe_entries;
CREATE POLICY multi_team_coach_insert ON public.session_rpe_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.player_accessible_to_current_coach(player_id)
    AND source_team_id IN (SELECT public.coach_team_ids())
  );

DROP POLICY IF EXISTS multi_team_coach_insert ON public.player_external_load_daily;
CREATE POLICY multi_team_coach_insert ON public.player_external_load_daily
  FOR INSERT TO authenticated
  WITH CHECK (
    public.player_accessible_to_current_coach(player_id)
    AND source_team_id IN (SELECT public.coach_team_ids())
  );

DROP POLICY IF EXISTS multi_team_coach_insert ON public.player_injuries;
CREATE POLICY multi_team_coach_insert ON public.player_injuries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.player_accessible_to_current_coach(player_id)
    AND source_team_id IN (SELECT public.coach_team_ids())
  );

-- 4) RLS on the new tables themselves ----------------------------------------
DROP POLICY IF EXISTS ptm_player_read_own ON public.player_team_memberships;
CREATE POLICY ptm_player_read_own ON public.player_team_memberships
  FOR SELECT TO authenticated
  USING (player_id IN (SELECT id FROM public.players WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS ptm_coach_read_own_teams ON public.player_team_memberships;
CREATE POLICY ptm_coach_read_own_teams ON public.player_team_memberships
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT public.coach_team_ids()));

DROP POLICY IF EXISTS ptm_coach_insert_own_teams ON public.player_team_memberships;
CREATE POLICY ptm_coach_insert_own_teams ON public.player_team_memberships
  FOR INSERT TO authenticated
  WITH CHECK (team_id IN (SELECT public.coach_team_ids()));

DROP POLICY IF EXISTS ptm_coach_update_own_teams ON public.player_team_memberships;
CREATE POLICY ptm_coach_update_own_teams ON public.player_team_memberships
  FOR UPDATE TO authenticated
  USING (team_id IN (SELECT public.coach_team_ids()))
  WITH CHECK (team_id IN (SELECT public.coach_team_ids()));

DROP POLICY IF EXISTS ptm_admin_all ON public.player_team_memberships;
CREATE POLICY ptm_admin_all ON public.player_team_memberships
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS pdg_player_read_own ON public.player_data_grants;
CREATE POLICY pdg_player_read_own ON public.player_data_grants
  FOR SELECT TO authenticated
  USING (player_id IN (SELECT id FROM public.players WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS pdg_coach_read_own_teams ON public.player_data_grants;
CREATE POLICY pdg_coach_read_own_teams ON public.player_data_grants
  FOR SELECT TO authenticated
  USING (granted_to_team_id IN (SELECT public.coach_team_ids()));

DROP POLICY IF EXISTS pdg_admin_all ON public.player_data_grants;
CREATE POLICY pdg_admin_all ON public.player_data_grants
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

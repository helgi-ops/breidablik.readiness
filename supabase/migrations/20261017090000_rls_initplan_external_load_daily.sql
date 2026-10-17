-- Perf: fix the Supabase "Auth RLS Initialization Plan" lint on the coach app's
-- hottest read table. The two SELECT policies on player_external_load_daily call
-- auth.uid() directly, so Postgres RE-EVALUATES it for EVERY row. The coach Today
-- page (and every load/ACWR surface) reads ~900 rows (whole squad × 35 days), so
-- auth.uid() ran ~900× per query — the cause of the 15 s client-side abort.
--
-- Wrapping each auth.uid() in a scalar subquery `(select auth.uid())` makes the
-- planner evaluate it ONCE (InitPlan) instead of per row. Behaviour is identical
-- (same rows visible to the same users) — this is Supabase's own recommended fix
-- for lint 0003_auth_rls_initplan. Read-path only; INSERT policy untouched.

alter policy player_external_load_daily_coach_read_team
  on public.player_external_load_daily
  using (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (select auth.uid())
        AND lower(COALESCE(pr.role, ''::text)) = ANY (ARRAY['coach'::text, 'admin'::text, 'staff'::text])
        AND (
          lower(COALESCE(pr.role, ''::text)) = 'admin'::text
          OR pr.team_id = player_external_load_daily.team_id
          OR player_external_load_daily.team_id IN (
            SELECT ct.team_id FROM coach_teams ct WHERE ct.coach_id = (select auth.uid())
          )
        )
    )
  );

alter policy player_external_load_daily_player_select_own
  on public.player_external_load_daily
  using (
    EXISTS (
      SELECT 1 FROM players p
      WHERE p.id = player_external_load_daily.player_id AND p.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = (select auth.uid()) AND pr.player_id = player_external_load_daily.player_id
    )
  );

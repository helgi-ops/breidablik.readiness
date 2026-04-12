-- Allow coaches to INSERT and UPDATE match_schedule rows for their teams.
-- Uses the same coach_team_ids() helper that the SELECT policy uses.

CREATE POLICY match_schedule_coach_insert ON public.match_schedule
  FOR INSERT
  WITH CHECK (
    team_id IN (SELECT coach_team_ids())
    OR is_staff()
  );

CREATE POLICY match_schedule_coach_update ON public.match_schedule
  FOR UPDATE
  USING (
    team_id IN (SELECT coach_team_ids())
    OR is_staff()
  )
  WITH CHECK (
    team_id IN (SELECT coach_team_ids())
    OR is_staff()
  );

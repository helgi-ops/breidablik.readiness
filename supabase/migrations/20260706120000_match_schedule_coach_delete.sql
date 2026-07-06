-- Allow coaches to DELETE match_schedule rows for their teams, so the
-- Fixtures (Leikjadagatal) page can remove a mistyped/cancelled fixture.
-- Deleting a fixture does NOT touch recorded minutes (match_minutes is keyed
-- separately by player_id + match_date). Same coach_team_ids() scope as the
-- existing insert/update policies.
CREATE POLICY match_schedule_coach_delete ON public.match_schedule
  FOR DELETE
  USING (
    team_id IN (SELECT coach_team_ids())
    OR is_staff()
  );

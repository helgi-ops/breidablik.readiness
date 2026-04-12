-- Add unique constraint on (team_id, match_date) so we can upsert opponent
-- from the match-minutes page. This is logically correct: one match per team per date.
ALTER TABLE public.match_schedule
  ADD CONSTRAINT match_schedule_team_date_uniq UNIQUE (team_id, match_date);

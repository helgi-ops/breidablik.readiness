-- Basketball weeks are defined by game count (0–3). The coach_week_setup
-- week_type CHECK only allowed NO_MATCH / ONE_MATCH / TWO_MATCHES (football
-- never has three league games in a week). Widen it to accept THREE_MATCHES.
-- Football behaviour is unchanged — it simply never stores the new value.

ALTER TABLE public.coach_week_setup
  DROP CONSTRAINT IF EXISTS coach_week_setup_week_type_check;

ALTER TABLE public.coach_week_setup
  ADD CONSTRAINT coach_week_setup_week_type_check
  CHECK (week_type = ANY (ARRAY['NO_MATCH'::text, 'ONE_MATCH'::text, 'TWO_MATCHES'::text, 'THREE_MATCHES'::text]));

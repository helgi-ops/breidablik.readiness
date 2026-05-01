-- Fix: setup_personal_trainer was creating phantom personal_trainer
-- teams for every PLAYER signup because SQL three-valued logic made
-- the early-return guard fail when raw_user_meta_data.team_type was
-- NULL (NULL != 'personal_trainer' is NULL, not TRUE).
--
-- Switching to IS DISTINCT FROM treats NULL as a real value, so the
-- guard now correctly bails out when team_type is missing or anything
-- other than 'personal_trainer'.
--
-- 22 phantom teams were already created and manually deleted by the
-- coach via the admin UI; this migration prevents new ones.

CREATE OR REPLACE FUNCTION public.setup_personal_trainer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_team_id uuid;
  v_name text;
BEGIN
  -- Only fire for explicit personal-trainer signups. Use IS DISTINCT
  -- FROM so a NULL team_type (the common case for PLAYER and COACH
  -- signups) bails out instead of falling through.
  IF (new.raw_user_meta_data->>'team_type') IS DISTINCT FROM 'personal_trainer' THEN
    RETURN new;
  END IF;

  v_name := COALESCE(new.raw_user_meta_data->>'full_name', new.email);

  -- Create team for the trainer
  INSERT INTO public.teams (name, sport, team_type, gender)
  VALUES (v_name, 'general', 'personal_trainer', 'mixed')
  RETURNING id INTO v_team_id;

  -- Link trainer as coach
  INSERT INTO public.coach_teams (coach_id, team_id, is_primary)
  VALUES (new.id, v_team_id, true);

  RETURN new;
END;
$function$;

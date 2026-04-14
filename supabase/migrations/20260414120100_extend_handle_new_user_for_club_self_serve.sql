-- Self-serve club creation: when a COACH signs up with team_type='club_team_new',
-- create team + first player atomically inside the trigger, so the signup wizard
-- only needs a single supabase.auth.signUp() call.
--
-- Incoming raw_user_meta_data for club creation:
--   role             = 'COACH'
--   team_type        = 'club_team_new'
--   team_name        (required)
--   sport            (required) — 'football' | 'basketball' | 'handball'
--   gender           (optional) — 'M' | 'F' | 'mixed'
--   club_short_name  (optional)
--   first_player_name (optional) — if present, creates a players row with team_id
--
-- Backwards compatible: existing signups with team_id still work unchanged.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role      TEXT;
  v_team_id   UUID;
  v_full_name TEXT;
  v_player_id UUID;
  v_team_type TEXT;
  v_team_name TEXT;
  v_sport     TEXT;
  v_gender    TEXT;
  v_club_short TEXT;
  v_first_player_name TEXT;
BEGIN
  v_role      := coalesce(new.raw_user_meta_data->>'role', 'PLAYER');
  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'display_name',
    ''
  );
  v_team_type := new.raw_user_meta_data->>'team_type';

  -- Safely parse team_id (null if missing or invalid UUID)
  BEGIN
    v_team_id := (new.raw_user_meta_data->>'team_id')::UUID;
  EXCEPTION WHEN others THEN
    v_team_id := NULL;
  END;

  -- ── Self-serve club creation ──
  -- Coach signed up without selecting a team; create one on their behalf.
  IF upper(v_role) = 'COACH' AND v_team_id IS NULL AND v_team_type = 'club_team_new' THEN
    v_team_name  := trim(coalesce(new.raw_user_meta_data->>'team_name', ''));
    v_sport      := coalesce(new.raw_user_meta_data->>'sport', 'football');
    v_gender     := new.raw_user_meta_data->>'gender';
    v_club_short := new.raw_user_meta_data->>'club_short_name';

    IF v_team_name <> '' THEN
      INSERT INTO public.teams (
        name, sport, gender, team_type,
        club_short_name, plan_tier,
        trial_ends_at, subscription_status
      )
      VALUES (
        v_team_name,
        v_sport,
        NULLIF(v_gender, ''),
        'club_team',
        NULLIF(v_club_short, ''),
        'PRO',
        now() + interval '14 days',
        'trial'
      )
      RETURNING id INTO v_team_id;
    END IF;
  END IF;

  -- Insert profile row (player_id will be updated below for PLAYER signups)
  INSERT INTO public.profiles (id, display_name, role, team_id, player_id, full_name)
  VALUES (
    new.id,
    v_full_name,
    v_role,
    CASE WHEN upper(v_role) = 'COACH' THEN v_team_id ELSE NULL END,
    NULL,
    v_full_name
  )
  ON CONFLICT (id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        role         = EXCLUDED.role,
        team_id      = CASE WHEN upper(EXCLUDED.role) = 'COACH' THEN EXCLUDED.team_id ELSE profiles.team_id END,
        full_name    = EXCLUDED.full_name;

  -- ── COACH signup: also insert into coaches + coach_teams ──
  IF upper(v_role) = 'COACH' THEN
    INSERT INTO public.coaches (user_id, display_name)
    VALUES (new.id, v_full_name)
    ON CONFLICT (user_id) DO NOTHING;

    IF v_team_id IS NOT NULL THEN
      INSERT INTO public.coach_teams (coach_id, team_id, is_primary)
      VALUES (new.id, v_team_id, true)
      ON CONFLICT DO NOTHING;
    END IF;

    -- First player for self-serve club creation
    IF v_team_type = 'club_team_new' AND v_team_id IS NOT NULL THEN
      v_first_player_name := trim(coalesce(new.raw_user_meta_data->>'first_player_name', ''));
      IF v_first_player_name <> '' THEN
        INSERT INTO public.players (full_name, team_id, status, is_active)
        VALUES (v_first_player_name, v_team_id, 'ACTIVE', true)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  -- For PLAYER signups: create a pending players row and link it back to the profile
  IF upper(v_role) = 'PLAYER' AND v_team_id IS NOT NULL THEN
    INSERT INTO public.players (user_id, full_name, team_id, status, requested_at, is_active)
    VALUES (
      new.id,
      v_full_name,
      v_team_id,
      'PENDING',
      now(),
      false
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_player_id;

    IF v_player_id IS NOT NULL THEN
      UPDATE public.profiles
      SET player_id = v_player_id,
          team_id   = v_team_id
      WHERE id = new.id;
    END IF;
  END IF;

  RETURN new;
END;
$function$;

-- Onboarding: a self-serve club is born with a team_settings row seeded from
-- its sport, so a basketball club is indoor + wellness-first from day one
-- instead of silently defaulting to football until a coach opens Settings.
--
-- Two changes:
--   1. handle_new_user() now inserts public.team_settings after creating the
--      team (sport_type from signup metadata; basketball ⇒ indoor_mode=true).
--      It also honours an optional product_plan in the signup metadata rather
--      than hardcoding PRO — default stays PRO so today's funnel is unchanged.
--   2. One-time backfill: every existing basketball team that has no
--      team_settings row gets one (sport_type='basketball', indoor, wellness).
--      Duplicate club rows are intentionally left alone (deleting is a manual
--      data-hygiene decision, not part of this migration).

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
  v_plan      TEXT;
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

    -- Honour an optional chosen plan; default PRO (unchanged from before).
    v_plan := upper(coalesce(new.raw_user_meta_data->>'product_plan', 'PRO'));
    IF v_plan NOT IN ('FREE', 'LITE', 'PRO', 'ELITE') THEN
      v_plan := 'PRO';
    END IF;

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
        v_plan,
        now() + interval '14 days',
        'trial'
      )
      RETURNING id INTO v_team_id;

      -- ── NEW: seed team_settings so the engine reads the right sport ──
      -- Basketball ⇒ indoor court, no GPS; sport_type also flips the decision
      -- weights and (via the app) hides the GPS-only Monitoring pages. Only
      -- 'football' | 'basketball' are valid sport_type values, so any other
      -- sport maps to 'football' for now (indoor stays off for those).
      IF v_team_id IS NOT NULL THEN
        INSERT INTO public.team_settings (
          team_id, sport_type, indoor_mode, uses_wellness_features
        )
        VALUES (
          v_team_id,
          CASE WHEN lower(v_sport) = 'basketball' THEN 'basketball' ELSE 'football' END,
          (lower(v_sport) = 'basketball'),
          true
        )
        ON CONFLICT (team_id) DO NOTHING;
      END IF;
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

    -- ── First player for self-serve club creation ──
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

-- ── One-time backfill: give every existing basketball team a team_settings row ──
INSERT INTO public.team_settings (team_id, sport_type, indoor_mode, uses_wellness_features)
SELECT t.id, 'basketball', true, true
FROM public.teams t
LEFT JOIN public.team_settings ts ON ts.team_id = t.id
WHERE lower(coalesce(t.sport, '')) = 'basketball'
  AND ts.team_id IS NULL
ON CONFLICT (team_id) DO NOTHING;

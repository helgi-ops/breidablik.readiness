-- PT self-serve: a personal trainer signs up at /signup/trainer, lands on a dashboard with a
-- demo client, follows a 3-step checklist, and gets a monthly report per client.
--
--   1. teams.country, players.is_demo
--   2. pt_onboarding      — checklist progress per PT team (existing practices start completed)
--   3. pt_monthly_reports — monthly report snapshot per client; sent_at = trainer shared it
--   4. seed_pt_demo_client(team) — one "Demo client" with 3 weeks of check-ins, sessions, VBT
--   5. setup_personal_trainer — practice_name / country, profile team link, demo seed
--
-- The demo client is excluded from client counts, reminders and monthly reports in code
-- (players.is_demo). It never has a user_id, so it can never receive a push.

-- ── 1. Columns ────────────────────────────────────────────────────────────
ALTER TABLE public.teams   ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_players_demo_team ON public.players (team_id) WHERE is_demo;

-- ── 2. Onboarding checklist progress (per team) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.pt_onboarding (
  team_id              uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  picked_programme_key text,
  picked_level         text,
  invited_at           timestamptz,
  programme_at         timestamptz,
  session_at           timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
-- Read/written only through /api/trainer/onboarding (service role) — no client policies.
ALTER TABLE public.pt_onboarding ENABLE ROW LEVEL SECURITY;

-- Existing practices are already set up: never show them the checklist.
INSERT INTO public.pt_onboarding (team_id, completed_at)
SELECT id, now() FROM public.teams WHERE team_type = 'personal_trainer'
ON CONFLICT (team_id) DO NOTHING;

-- ── 3. Monthly client reports ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pt_monthly_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  player_id    uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  month        date NOT NULL,          -- first day of the reported month
  report       jsonb NOT NULL,         -- PtClientReport payload, rendered to PDF in the browser
  generated_at timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz,            -- trainer pressed "Send to client" → client can see it
  sent_by      uuid,
  UNIQUE (player_id, month)
);
CREATE INDEX IF NOT EXISTS idx_pt_monthly_reports_team ON public.pt_monthly_reports (team_id, month DESC);
-- Read/written only through /api/pt/monthly-reports and the cron (service role).
ALTER TABLE public.pt_monthly_reports ENABLE ROW LEVEL SECURITY;

-- ── 4. Demo client seed ───────────────────────────────────────────────────
-- Deterministic 3-week history ending yesterday (today's check-in included):
--   check-ins most days (2 missed), Mon/Wed/Fri strength sessions with set logs,
--   back-squat bar speeds (VBT), and a session RPE per session.
-- Check-ins insert only the five answers: the readiness triggers compute the
-- score and colour exactly as for a real check-in.
CREATE OR REPLACE FUNCTION public.seed_pt_demo_client(p_team_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_player uuid;
  v_day    date;
  v_i      int;
  v_wk     int;      -- 0, 1, 2 = week of the block (progression)
  v_squat  numeric;
  v_set    int;
  v_rpe    numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM teams WHERE id = p_team_id AND team_type = 'personal_trainer') THEN
    RAISE EXCEPTION 'seed_pt_demo_client: % is not a personal-trainer team', p_team_id;
  END IF;

  SELECT id INTO v_player FROM players WHERE team_id = p_team_id AND is_demo LIMIT 1;
  IF v_player IS NOT NULL THEN
    RETURN v_player;
  END IF;

  INSERT INTO players (full_name, team_id, status, is_active, is_demo, sport, uses_wellness_features)
  VALUES ('Demo client', p_team_id, 'ACTIVE', true, true, 'general', true)
  RETURNING id INTO v_player;

  FOR v_i IN REVERSE 20..0 LOOP
    v_day := current_date - v_i;
    v_wk  := (20 - v_i) / 7;

    -- Daily check-in (missed on two days). Mostly good; heavier legs the day after
    -- a session; a poorer night two days ago so the trend is not flat.
    IF v_i NOT IN (6, 13) THEN
      INSERT INTO readiness_entries (
        player_id, team_id, entry_date,
        fatigue_energy, sleep_quality, sleep_duration, stress_mood, muscle_soreness, is_imputed
      ) VALUES (
        v_player, p_team_id, v_day,
        CASE WHEN v_i = 2 THEN 3 ELSE 4 END,
        CASE WHEN v_i = 2 THEN 2 WHEN v_i % 5 = 0 THEN 3 ELSE 4 END,
        CASE WHEN v_i = 2 THEN 2 ELSE 4 END,
        CASE WHEN v_i % 4 = 0 THEN 3 ELSE 4 END,
        CASE WHEN extract(isodow FROM v_day) IN (2, 4, 6) THEN 3 ELSE 4 END,
        false
      )
      ON CONFLICT DO NOTHING;
    END IF;

    -- Strength sessions Mon / Wed / Fri, up to yesterday (today stays open).
    IF v_i > 0 AND extract(isodow FROM v_day) IN (1, 3, 5) THEN
      v_squat := 80 + v_wk * 5;            -- 80 → 85 → 90 kg
      v_rpe   := 6.5 + v_wk * 0.5;          -- RPE 6.5 → 7.5

      FOR v_set IN 1..3 LOOP
        INSERT INTO pt_exercise_set_logs (player_id, team_id, session_date, exercise_name, set_number, weight_kg, reps, rpe, source)
        VALUES
          (v_player, p_team_id, v_day, 'Back Squat',        v_set, v_squat,           5, v_rpe,       'client'),
          (v_player, p_team_id, v_day, 'Bench Press',       v_set, 60 + v_wk * 2.5,   5, v_rpe,       'client'),
          (v_player, p_team_id, v_day, 'Romanian Deadlift', v_set, 70 + v_wk * 5,     8, v_rpe - 0.5, 'client');

        -- Bar speed on the squat: a little faster each week even as the load goes up.
        INSERT INTO player_strength_set_log (
          player_id, team_id, session_date, exercise_id, exercise_name, canonical_lift,
          set_index, weight_kg, reps, rpe, mean_velocity, peak_velocity, is_warmup, source
        ) VALUES (
          v_player, p_team_id, v_day, 'back_squat', 'Back Squat', 'back squat',
          v_set, v_squat, 5, v_rpe,
          round((0.62 + v_wk * 0.03 - (v_set - 1) * 0.02)::numeric, 2),
          round((1.05 + v_wk * 0.04 - (v_set - 1) * 0.02)::numeric, 2),
          false, 'coach'
        )
        ON CONFLICT DO NOTHING;
      END LOOP;

      INSERT INTO session_rpe_entries (player_id, team_id, session_date, session_type, session_name, duration_minutes, rpe, session_load, source)
      VALUES (v_player, p_team_id, v_day, 'individual', 'Strength', 55, v_rpe, round(55 * v_rpe)::int, 'client');
    END IF;
  END LOOP;

  RETURN v_player;
END;
$function$;

-- Only the signup trigger and the service role may seed (never a signed-in user via RPC).
REVOKE ALL ON FUNCTION public.seed_pt_demo_client(uuid) FROM PUBLIC, anon, authenticated;

-- ── 5. Personal-trainer signup trigger ────────────────────────────────────
-- Unchanged guard: IS DISTINCT FROM so a NULL team_type (every PLAYER and club
-- COACH signup) returns before anything is created — the phantom-team fix of
-- 20260501183641 stays exactly as it was.
CREATE OR REPLACE FUNCTION public.setup_personal_trainer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_team_id uuid;
  v_name    text;
  v_country text;
BEGIN
  -- Only fire for explicit personal-trainer signups. Use IS DISTINCT
  -- FROM so a NULL team_type (the common case for PLAYER and COACH
  -- signups) bails out instead of falling through.
  IF (new.raw_user_meta_data->>'team_type') IS DISTINCT FROM 'personal_trainer' THEN
    RETURN new;
  END IF;

  v_name := COALESCE(
    NULLIF(trim(new.raw_user_meta_data->>'practice_name'), ''),
    NULLIF(trim(new.raw_user_meta_data->>'full_name'), ''),
    new.email
  );
  v_country := NULLIF(trim(new.raw_user_meta_data->>'country'), '');

  -- Create team for the trainer
  INSERT INTO public.teams (name, sport, team_type, gender, country)
  VALUES (v_name, 'general', 'personal_trainer', 'mixed', v_country)
  RETURNING id INTO v_team_id;

  -- Link trainer as coach
  INSERT INTO public.coach_teams (coach_id, team_id, is_primary)
  VALUES (new.id, v_team_id, true);

  -- The coach app opens the team in profiles.team_id. handle_new_user (trigger
  -- on_auth_user_created, which fires first by name) wrote the profile without a team.
  -- Only a COACH profile is linked (the /signup/trainer page always sends role COACH).
  UPDATE public.profiles SET team_id = v_team_id
   WHERE id = new.id AND team_id IS NULL AND upper(role) = 'COACH';

  INSERT INTO public.pt_onboarding (team_id) VALUES (v_team_id)
  ON CONFLICT (team_id) DO NOTHING;

  -- Demo client: never let a seeding problem block the signup.
  BEGIN
    PERFORM public.seed_pt_demo_client(v_team_id);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'setup_personal_trainer: demo seed failed for team %: %', v_team_id, SQLERRM;
  END;

  RETURN new;
END;
$function$;

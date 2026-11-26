-- Fix for 20261121120000: session_rpe_entries.session_load is a generated column
-- (duration × RPE), so the demo seed must not write it. The first version raised
-- inside setup_personal_trainer's guarded block, so signups still succeeded but
-- no demo client was created. Same function otherwise.

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

      INSERT INTO session_rpe_entries (player_id, team_id, session_date, session_type, session_name, duration_minutes, rpe, source)
      VALUES (v_player, p_team_id, v_day, 'individual', 'Strength', 55, v_rpe, 'client');
    END IF;
  END LOOP;

  RETURN v_player;
END;
$function$;

-- Only the signup trigger and the service role may seed (never a signed-in user via RPC).
REVOKE ALL ON FUNCTION public.seed_pt_demo_client(uuid) FROM PUBLIC, anon, authenticated;

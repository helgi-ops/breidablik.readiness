-- Regression check for the PT signup trigger (setup_personal_trainer).
-- Run in the Supabase SQL editor (or via execute_sql). Everything rolls back:
-- the block always ends in an exception whose message carries the result.
--
-- Expect:
--   player_signup_new_teams = 0   (the phantom-team bug, 20260501183641)
--   club_signup_pt_teams    = 0   (club "Create a club" signup makes a club team only)
--   pt_signup_new_teams     = 1, pt_profile_linked = true, pt_demo_client = true
DO $$
DECLARE
  t0 int; t1 int; t2 int; t3 int;
  v_pl uuid := gen_random_uuid(); v_cc uuid := gen_random_uuid(); v_pt uuid := gen_random_uuid();
  v_team uuid;
BEGIN
  SELECT count(*) INTO t0 FROM teams;
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_pl, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-check-player@example.invalid',
          '{"full_name":"Check Player","role":"PLAYER"}'::jsonb, now(), now());
  SELECT count(*) INTO t1 FROM teams;

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_cc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-check-club@example.invalid',
          '{"full_name":"Check Club","role":"COACH","team_type":"club_team_new","team_name":"ZZ Check FC","sport":"football"}'::jsonb, now(), now());
  SELECT count(*) INTO t2 FROM teams;

  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES (v_pt, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-check-pt@example.invalid',
          '{"full_name":"Check Trainer","role":"COACH","team_type":"personal_trainer","practice_name":"Check Lab","country":"IS"}'::jsonb, now(), now());
  SELECT count(*) INTO t3 FROM teams;
  SELECT team_id INTO v_team FROM coach_teams WHERE coach_id = v_pt;

  RAISE EXCEPTION 'RESULT %', jsonb_build_object(
    'player_signup_new_teams', t1 - t0,
    'club_signup_pt_teams', (SELECT count(*) FROM coach_teams ct JOIN teams t ON t.id = ct.team_id
                              WHERE ct.coach_id = v_cc AND t.team_type = 'personal_trainer'),
    'pt_signup_new_teams', t3 - t2,
    'pt_team_name', (SELECT name FROM teams WHERE id = v_team),
    'pt_profile_linked', (SELECT team_id = v_team FROM profiles WHERE id = v_pt),
    'pt_demo_client', EXISTS (SELECT 1 FROM players WHERE team_id = v_team AND is_demo)
  );
END $$;

-- Gym-only 8-week goals (2026-11-18, step 2): Maximal strength, Explosive power, Strength + power.
-- Widens three CHECK constraints so the new goals and their two test measures can be stored. No data changes.
-- No function references these constraints (checked pg_proc 2026-11-18).

alter table public.player_goal_plans drop constraint if exists player_goal_plans_quality_check;
alter table public.player_goal_plans add constraint player_goal_plans_quality_check
  check (quality = any (array['top_speed','acceleration','braking','jump','max_strength','explosive','strength_power']::text[]));

alter table public.team_quality_plan_prefs drop constraint if exists team_quality_plan_prefs_quality_check;
alter table public.team_quality_plan_prefs add constraint team_quality_plan_prefs_quality_check
  check (quality = any (array['top_speed','acceleration','braking','jump','max_strength','explosive','strength_power']::text[]));

-- imtp_nkg = mid-thigh pull relative peak force (N/kg, VALD); lift_test_kg = the coach's lift test (kg).
alter table public.player_goal_plan_results drop constraint if exists player_goal_plan_results_measure_check;
alter table public.player_goal_plan_results add constraint player_goal_plan_results_measure_check
  check (measure = any (array['flying_20m_s','top_speed_kmh','sprint_10m_s','cut_test_s','cmj_cm','imtp_nkg','lift_test_kg']::text[]));

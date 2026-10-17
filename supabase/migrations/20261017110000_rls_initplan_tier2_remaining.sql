-- Perf: "Auth RLS Initialization Plan" fix — TIER 2 (all remaining public tables).
-- Same identity-preserving transform as tier 1 / player_external_load_daily: wrap
-- every bare auth.<fn>() in `(select auth.<fn>())` so it evaluates once per query
-- (InitPlan), not per row. Idempotent (unwrap→wrap) and atomic. Processes every
-- remaining flagged policy in the public schema; the already-fixed tables are
-- excluded (they would be a no-op anyway). Supabase lint 0003 remediation.
do $$
declare
  r record;
  fq text;
  fw text;
  stmt text;
  already text[] := array[
    'player_external_load_daily',
    'players','profiles','readiness_entries','stage4_decisions','stage4_overrides',
    'coach_signals','coach_teams','team_coaches','teams','match_player_minutes',
    'match_schedule','week_plans','week_setups','training_session_context',
    'athlete_metric_baselines','athlete_decision_history','player_today_strength_override',
    'vald_forcedecks_results','player_strength_set_log','player_session_rpe','team_integrations'
  ];
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and not (tablename = any(already))
      and (coalesce(qual,'') ~ 'auth\.(uid|role|jwt|email)\(\)' or coalesce(with_check,'') ~ 'auth\.(uid|role|jwt|email)\(\)')
  loop
    fq := regexp_replace(
            regexp_replace(
              regexp_replace(r.qual, '\(\s*SELECT\s+auth\.(uid|role|jwt|email)\(\)\s+AS\s+\w+\s*\)', 'auth.\1()', 'gi'),
            'auth\.(uid|role|jwt|email)\(\)', '(select auth.\1())', 'g'),
          'auth\.(uid|role|jwt|email)\(\)', '(select auth.\1())', 'g');
    fw := regexp_replace(
            regexp_replace(
              regexp_replace(r.with_check, '\(\s*SELECT\s+auth\.(uid|role|jwt|email)\(\)\s+AS\s+\w+\s*\)', 'auth.\1()', 'gi'),
            'auth\.(uid|role|jwt|email)\(\)', '(select auth.\1())', 'g'),
          'auth\.(uid|role|jwt|email)\(\)', '(select auth.\1())', 'g');

    stmt := format('alter policy %I on public.%I', r.policyname, r.tablename);
    if r.qual is not null then stmt := stmt || ' using (' || fq || ')'; end if;
    if r.with_check is not null then stmt := stmt || ' with check (' || fw || ')'; end if;
    execute stmt;
  end loop;
end $$;

-- Perf: "Auth RLS Initialization Plan" fix — TIER 1 (hot coach-path tables).
-- Wrap every bare auth.<fn>() in a scalar subquery `(select auth.<fn>())` so the
-- planner evaluates it ONCE per query (InitPlan) instead of once per row. Pure
-- read-/write-visibility-preserving transform (Supabase lint 0003 remediation):
-- same rows, same users — only the evaluation timing changes.
--
-- The DO block processes each policy individually, is idempotent (unwrap→wrap, so
-- re-running is a no-op), and atomic (any parse failure rolls the whole batch
-- back). It rebuilds only the USING / WITH CHECK clause that already exists on
-- each policy, so an INSERT-only or SELECT-only policy keeps its shape.
do $$
declare
  r record;
  fq text;
  fw text;
  stmt text;
  tier1 text[] := array[
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
      and tablename = any(tier1)
      and (coalesce(qual,'') ~ 'auth\.' or coalesce(with_check,'') ~ 'auth\.')
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

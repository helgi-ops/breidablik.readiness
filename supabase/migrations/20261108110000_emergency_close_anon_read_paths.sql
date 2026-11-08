-- EMERGENCY (2026-11-08): close the no-login read/write paths found by the tenant-isolation audit.
--
-- 1. 72 public views run with owner rights (no security_invoker), so they bypass RLS, and `anon` held
--    SELECT on all of them. With only the public anon key (it ships in the browser bundle) anyone could
--    read v_coach_readiness_today_v8: 18,671 rows of player names, sleep, soreness, stress, notes, colour.
--    No pre-login page reads a view (LoginInner reads v_player_daily_decision_v3 only after sign-in).
-- 2. Tables with RLS off gave `anon` full read AND write.
-- 3. SECURITY DEFINER RPCs with no auth check were callable by `anon` (and by any signed-in user): they
--    delete chat messages, write other teams' templates, create tables, return coach e-mail addresses.
--
-- Deliberately NOT touched: the RLS helpers (is_admin, is_staff, coach_team_ids, my_player_id, ...).
-- Policies evaluated as anon call them, so revoking them would break the /signup team list.
-- `authenticated` access to the views is handled separately: see 20261108140000 (security_invoker).
-- Rollback for any single object is a plain GRANT.

-- 1. Views: anon out.
do $$
declare v record;
begin
  for v in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  loop
    execute format('revoke all on public.%I from anon', v.relname);
  end loop;
end $$;

-- 2. RLS-off tables.
-- Server-only (no browser reader in src): service role only, RLS on with no policies.
alter table public.opponent_scout_shares enable row level security;
alter table public.opponent_player_clips enable row level security;
revoke all on public.opponent_scout_shares from anon, authenticated;
revoke all on public.opponent_player_clips from anon, authenticated;
alter table public.backup_imputed_load_20260713 enable row level security;
revoke all on public.backup_imputed_load_20260713 from anon, authenticated;

-- Custom *_microdose_templates: the coach display reads these by dynamic table name while signed in, so
-- they keep authenticated access for now. anon goes out of every table with RLS off.
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('revoke all on public.%I from anon', t.relname);
  end loop;
end $$;

-- 3. SECURITY DEFINER RPCs without an auth check.
-- 3a. Server-only or no caller at all: service role only. pg_cron runs as the owner and is unaffected.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
      'admin_link_profile_player', 'calculate_readiness_flags', 'coach_lock_entry', 'ensure_week_plans',
      'fn_impute_missing_readiness', 'fn_impute_missing_rpe', 'fn_impute_team_day', 'impute_off_day_checkins',
      'lock_player_microdose_plan', 'mp_repair_null_variants', 'purge_old_player_coach_messages',
      'refresh_athlete_metric_baselines', 'refresh_demo_football_teams', 'refresh_demo_full_checkins',
      'refresh_demo_gps_load', 'refresh_demo_lite_checkins', 'refresh_stride_baselines',
      'save_custom_template_records', 'read_custom_template_records', 'create_custom_microdose_table',
      'compute_injury_retrospective_signals', 'compute_player_readiness', 'detect_all_team_notifications',
      'get_player_training_today', 'get_team_coaches_with_email', 'get_usage_summary',
      'player_has_active_consent', 'stage4_fetch_final_for_date'
    )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- 3b. Called from the browser while signed in: anon out, authenticated stays until they get team guards.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
      'refresh_mcburnie_decel_baselines', 'stage4_bootstrap_for_date', 'stage4_ensure_decision',
      'get_mcburnie_decel_status', 'is_minor'
    )
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- 4. Stop the same hole reopening: new objects no longer hand anon rights by default. (Custom template
-- tables are created at runtime by create_custom_microdose_table and would otherwise get anon + RLS off.)
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

-- is_staff() matches everyone in staff_users, and 33 of the 38 rows there are ordinary coaches (backfill 20260704120000).
-- Every "... OR is_staff()" policy therefore let a coach read and write other teams from the browser.
-- Real staff are is_elevated_staff(). Coaches keep their own teams through coach_team_ids() / coaches_team().
--
-- Rollback: alter each policy back to is_staff(). The function stays so that remains possible, and the nightly audit
-- raises a high finding if a policy starts using it again.

-- These need more than a swap.

-- Required is_staff() AND (elevated OR own team). Own team alone is the rule now, so staff_users no longer decides it.
alter policy coach_week_setup_delete_scoped on public.coach_week_setup
  using (is_elevated_staff() or coaches_team(team_id));
alter policy coach_week_setup_insert_scoped on public.coach_week_setup
  with check (is_elevated_staff() or coaches_team(team_id));
alter policy coach_week_setup_update_scoped on public.coach_week_setup
  using (is_elevated_staff() or coaches_team(team_id))
  with check (is_elevated_staff() or coaches_team(team_id));

-- player_accessible_to_current_coach() reads memberships and grants, and 253 active players have no active membership
-- row. Without the team branch their own coach would lose this path once is_staff() is gone.
alter policy readiness_entries_coach_write on public.readiness_entries
  using (
    player_accessible_to_current_coach(player_id)
    or team_id in (select coach_team_ids())
    or is_elevated_staff()
    or is_admin()
  )
  with check (
    player_accessible_to_current_coach(player_id)
    or team_id in (select coach_team_ids())
    or is_elevated_staff()
    or is_admin()
  );

-- is_coach() has no team in it, so any coach could add an override to any team's decision.
alter policy microdose_overrides_write on public.microdose_overrides
  with check (
    decision_id in (
      select d.id from microdose_decisions d where d.team_id in (select coach_team_ids())
    )
    or is_elevated_staff()
  );

-- coach_user_id = me alone let any login, players included, add an override to any team's decision under their own name.
alter policy stage4_overrides_write on public.stage4_overrides
  with check (
    (
      coach_user_id = (select auth.uid())
      and decision_id in (
        select d.id from stage4_decisions d where d.team_id in (select coach_team_ids())
      )
    )
    or is_elevated_staff()
  );

-- The rest already carry a team or own-row branch, so only the staff check changes. The same pass covers the policies
-- that had only is_staff(): pipeline_health_log read has no browser reader, so it becomes real staff only.
do $$
declare
  r record;
  v_using text;
  v_check text;
  v_left int;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ '\mis_staff\(' or coalesce(with_check, '') ~ '\mis_staff\(')
  loop
    v_using := regexp_replace(r.qual, '\mis_staff\(\)', 'is_elevated_staff()', 'g');
    v_check := regexp_replace(r.with_check, '\mis_staff\(\)', 'is_elevated_staff()', 'g');
    execute format(
      'alter policy %I on public.%I%s%s',
      r.policyname,
      r.tablename,
      case when v_using is not null then ' using (' || v_using || ')' else '' end,
      case when v_check is not null then ' with check (' || v_check || ')' else '' end
    );
  end loop;

  select count(*) into v_left
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') ~ '\mis_staff\(' or coalesce(with_check, '') ~ '\mis_staff\(');
  if v_left > 0 then
    raise exception '% policies still use is_staff()', v_left;
  end if;
end $$;

-- These reach a row through the player's CURRENT team. Without is_staff() a team would lose its own history for players
-- who have since left (measured: 486 of 4,666 load rows for one coach). The row's own team_id keeps that history with
-- the team that recorded it. A new club still sees nothing from before, unless a grant or membership says so.
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname, qual
    from pg_policies
    where schemaname = 'public'
      and (tablename, policyname) in (
        ('player_daily_load', 'player_daily_load_access'),
        ('player_load_metrics', 'player_load_metrics_access'),
        ('player_microdose_plan_locks', 'player_microdose_plan_locks_access'),
        ('rpe_notification_log', 'rpe_notification_log_read'),
        ('email_reminder_log', 'email_reminder_log_read'),
        ('player_session_rpe', 'player_session_rpe_sel_merged'),
        ('session_rpe_entries', 'session_rpe_entries_sel_authenticated_merged')
      )
  loop
    execute format(
      'alter policy %I on public.%I using ((team_id in (select coach_team_ids())) or (%s))',
      r.policyname,
      r.tablename,
      r.qual
    );
  end loop;
end $$;

comment on function public.is_staff() is
  'Matches every staff_users row, including ordinary coaches. Do not use in a policy: it opens other teams. Use is_elevated_staff() or a team check.';

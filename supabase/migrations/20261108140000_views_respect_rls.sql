-- Views stop bypassing row-level security.
--
-- The public views ran with their owner's rights, so any logged-in user read every team through them.
-- security_invoker makes each view obey the caller's RLS on the underlying tables. Server routes use the
-- service role and are unaffected. Checked in rolled-back probes as a coach, a player and an admin: no errors,
-- coaches and players see only their scope, an admin sees all. Rows a player logged at a previous club
-- (other team_id) are no longer visible to the new club's coach, which is the intended separation.
-- Rollback: alter view ... set (security_invoker = false).
--
-- Still open: coaches with a staff_users row reach other teams through `or is_staff()` branches in RLS policies.
-- That is handled separately.

-- stage4_decisions had no read path for a player or a multi-team coach, and the final-decision view depends on it.
drop policy if exists stage4_decisions_read_scoped on public.stage4_decisions;
create policy stage4_decisions_read_scoped on public.stage4_decisions
  for select to authenticated
  using (
    public.is_admin()
    or public.is_elevated_staff()
    or team_id in (select public.coach_team_ids())
    or player_id = (select public.my_player_id())
  );

do $$
declare v text;
begin
  for v in
    select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
  loop
    execute format('alter view public.%I set (security_invoker = true)', v);
  end loop;
end $$;

-- `(true or is_staff())` let every logged-in user read every team's week setup.
drop policy if exists coach_week_setup_sel_authenticated_merged on public.coach_week_setup;
create policy coach_week_setup_sel_scoped on public.coach_week_setup
  for select to authenticated
  using (
    public.is_admin()
    or public.is_elevated_staff()
    or public.coaches_team(team_id)
    or team_id in (select p.team_id from public.players p where p.user_id = (select auth.uid()))
    or team_id in (select e.team_id from public.exec_teams e where e.exec_id = (select auth.uid()))
  );

-- USING (true) exposed all readiness-audit rows, including coach messages, to any logged-in user. No app code reads it.
drop policy if exists coach_select_audit on public.readiness_entry_audit;

-- WITH CHECK (true) let any logged-in user insert a prescription for any player.
alter policy pt_corr_coach_all on public.pt_corrective_prescriptions
  with check (
    exists (
      select 1 from public.profiles pr
       where pr.id = (select auth.uid())
         and (
           upper(coalesce(pr.role, '')) = 'ADMIN'
           or (
             upper(coalesce(pr.role, '')) in ('COACH', 'STAFF')
             and (
               pr.team_id = pt_corrective_prescriptions.team_id
               or exists (
                 select 1 from public.coach_teams ct
                  where ct.coach_id = pr.id and ct.team_id = pt_corrective_prescriptions.team_id
               )
             )
           )
         )
    )
  );

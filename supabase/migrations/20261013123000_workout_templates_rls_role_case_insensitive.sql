-- Fix: the workout_templates team-scoped policies from 20261013120000 compared profiles.role
-- against the lowercase literals 'coach'/'admin' case-SENSITIVELY, but roles are stored
-- UPPERCASE in this DB (COACH ×17, ADMIN ×1, plus one lowercase 'coach'). Every app auth
-- helper normalizes case (requireCoachAccessForTeam lowercases, requireCoachUserId/getCoachTeam
-- uppercase) — the RLS did not, so the 18 coach + 1 admin accounts got NO coach access to
-- workout_templates (own-team rows hidden, create/update/delete and the admin bypass all dead).
--
-- Recreate the five role-dependent policies with lower(p.role) so they match any casing.
-- The data predicate (coach_team_ids() ∪ profiles.team_id, global via team_id IS NULL) is
-- unchanged, as are wt_select_active and the two player assignment-read policies.

drop policy if exists wt_coach_select_own on public.workout_templates;
drop policy if exists wt_coach_insert_own on public.workout_templates;
drop policy if exists wt_coach_update_own on public.workout_templates;
drop policy if exists wt_coach_delete_own on public.workout_templates;
drop policy if exists wt_admin_all on public.workout_templates;

create policy wt_coach_select_own on public.workout_templates
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = any (array['coach','admin']))
    and (
      team_id is null
      or team_id in (select public.coach_team_ids())
      or team_id = (select p.team_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy wt_coach_insert_own on public.workout_templates
  for insert
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = any (array['coach','admin']))
    and team_id is not null
    and (
      team_id in (select public.coach_team_ids())
      or team_id = (select p.team_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy wt_coach_update_own on public.workout_templates
  for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = any (array['coach','admin']))
    and team_id is not null
    and (
      team_id in (select public.coach_team_ids())
      or team_id = (select p.team_id from public.profiles p where p.id = auth.uid())
    )
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = any (array['coach','admin']))
    and team_id is not null
    and (
      team_id in (select public.coach_team_ids())
      or team_id = (select p.team_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy wt_coach_delete_own on public.workout_templates
  for delete
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = any (array['coach','admin']))
    and team_id is not null
    and (
      team_id in (select public.coach_team_ids())
      or team_id = (select p.team_id from public.profiles p where p.id = auth.uid())
    )
  );

-- Admin: full access, including publishing curated global rows (team_id IS NULL).
create policy wt_admin_all on public.workout_templates
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and lower(p.role) = 'admin'));

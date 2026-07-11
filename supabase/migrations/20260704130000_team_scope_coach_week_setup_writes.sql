-- Team-scope coach_week_setup writes.
--
-- Before: INSERT/UPDATE/DELETE were gated only on is_staff() — a GLOBAL flag — so any coach
-- could set up the week for ANY team. Requirement: a coach may only set up the week for teams
-- they manage. After: writes require the row's team_id to be one the coach manages
-- (coach_teams). Elevated/global staff (staff_users.role='staff' — admins/org staff) keep full
-- cross-team access. SELECT is unchanged (players + coaches still read the preview).
--
-- Verified: HK coaches (role='coach') → can write HK, cannot write Breiðablik; staff → both.

-- global (elevated) staff — role='staff' in staff_users
create or replace function public.is_elevated_staff()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.staff_users where user_id = auth.uid() and role = 'staff'
  )
$$;

-- does the current user coach this specific team?
create or replace function public.coaches_team(p_team uuid)
returns boolean language sql stable security definer as $$
  select p_team is not null and exists (
    select 1 from public.coach_teams where coach_id = auth.uid() and team_id = p_team
  )
$$;

drop policy if exists coach_week_setup_insert_staff on public.coach_week_setup;
create policy coach_week_setup_insert_scoped on public.coach_week_setup
  for insert to authenticated
  with check ( is_staff() and (is_elevated_staff() or coaches_team(team_id)) );

drop policy if exists coach_week_setup_update_staff on public.coach_week_setup;
create policy coach_week_setup_update_scoped on public.coach_week_setup
  for update to authenticated
  using ( is_staff() and (is_elevated_staff() or coaches_team(team_id)) )
  with check ( is_staff() and (is_elevated_staff() or coaches_team(team_id)) );

drop policy if exists coach_week_setup_delete_staff on public.coach_week_setup;
create policy coach_week_setup_delete_scoped on public.coach_week_setup
  for delete to authenticated
  using ( is_staff() and (is_elevated_staff() or coaches_team(team_id)) );

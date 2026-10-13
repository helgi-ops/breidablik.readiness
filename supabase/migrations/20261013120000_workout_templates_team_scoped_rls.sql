-- Team-scope workout_templates so a coach only ever sees/edits their OWN club's authored
-- templates plus the curated global library (team_id IS NULL) — never another club's rows.
--
-- Problem (live): policy `wt_coach_all` (cmd ALL) granted ANY coach/admin full
-- SELECT/INSERT/UPDATE/DELETE on EVERY row with no team predicate, and `wt_select_active`
-- let any authenticated user read every active row. Combined with the Programmes tab
-- writing `team_id = NULL` on create, every coach at every club could see, edit, delete,
-- and publish into every other club's library. Nothing had leaked only because no second
-- club had used the tab yet (42 global seed rows + 47 Breiðablik seed rows, distinct_teams=1).
--
-- Target: "team-private + curated-shared". A coach reads the global library + their own
-- team's rows; writes only their own team's rows (and can NEVER write a global row); only
-- admin publishes global (team_id IS NULL) rows. Player assigned-template reads unchanged.
--
-- "A coach's teams" mirrors the app's getCoachTeam = profiles.team_id ∪ coach_teams, so the
-- predicate covers both linkage styles (public.coach_team_ids() reads only coach_teams).
-- "Who is a coach" keeps the original policy's notion (profiles.role IN ('coach','admin'))
-- so no one who has access today loses it except for the intended cross-team restriction.
--
-- Backward-safe: the 42 global seeds stay globally readable (the curated library); Breiðablik's
-- 47 team rows become visible only to Breiðablik coaches. No data migration.

alter table public.workout_templates enable row level security;

-- Replace the two over-broad policies; leave the player assignment-read policies untouched
-- (wt_player_select_assigned, wt_select_assigned_to_player).
drop policy if exists wt_coach_all on public.workout_templates;
drop policy if exists wt_select_active on public.workout_templates;

-- Curated global library: any authenticated user may read ACTIVE GLOBAL rows (team_id IS NULL).
-- Players still read their assigned team-owned templates via the untouched assignment policies.
create policy wt_select_active on public.workout_templates
  for select
  using (is_active = true and team_id is null);

-- Coach reads: the curated global library + their own team's rows, nothing else.
create policy wt_coach_select_own on public.workout_templates
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['coach','admin']))
    and (
      team_id is null
      or team_id in (select public.coach_team_ids())
      or team_id = (select p.team_id from public.profiles p where p.id = auth.uid())
    )
  );

-- Coach writes: ONLY their own team's rows, and never a global (team_id IS NULL) row.
create policy wt_coach_insert_own on public.workout_templates
  for insert
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['coach','admin']))
    and team_id is not null
    and (
      team_id in (select public.coach_team_ids())
      or team_id = (select p.team_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy wt_coach_update_own on public.workout_templates
  for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['coach','admin']))
    and team_id is not null
    and (
      team_id in (select public.coach_team_ids())
      or team_id = (select p.team_id from public.profiles p where p.id = auth.uid())
    )
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['coach','admin']))
    and team_id is not null
    and (
      team_id in (select public.coach_team_ids())
      or team_id = (select p.team_id from public.profiles p where p.id = auth.uid())
    )
  );

create policy wt_coach_delete_own on public.workout_templates
  for delete
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['coach','admin']))
    and team_id is not null
    and (
      team_id in (select public.coach_team_ids())
      or team_id = (select p.team_id from public.profiles p where p.id = auth.uid())
    )
  );

-- Admin: full access, including publishing curated global rows (team_id IS NULL).
create policy wt_admin_all on public.workout_templates
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

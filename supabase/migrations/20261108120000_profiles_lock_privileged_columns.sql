-- Users can no longer change their own role, admin flag, team or player link from the browser.
--
-- profiles_update_own had no column limits, so any logged-in user could set is_admin=true, role='ADMIN' or another
-- team_id on their own row, and server routes trust those columns. Revoking columns alone has no effect while the
-- table-level UPDATE stands, so the table grant goes and only the name columns come back.
-- Applied after the code that moved team switching and player linking to server routes was deployed.
-- PostgREST rejects a whole UPDATE (42501) if it touches a locked column.
-- Rollback: grant update on public.profiles to authenticated.

revoke update on public.profiles from authenticated, anon;
grant update (full_name, display_name) on public.profiles to authenticated;
revoke insert, delete on public.profiles from anon;

-- match_player_minutes: USING (true) let any logged-in user read and change every team's minutes.
drop policy if exists "mpm read" on public.match_player_minutes;
create policy "mpm read" on public.match_player_minutes
  for select to authenticated
  using (public.is_admin() or public.is_elevated_staff() or public.coaches_team(team_id) or player_id = (select public.my_player_id()));

drop policy if exists "mpm update" on public.match_player_minutes;
create policy "mpm update" on public.match_player_minutes
  for update to authenticated
  using (public.is_admin() or public.is_elevated_staff() or public.coaches_team(team_id))
  with check (public.is_admin() or public.is_elevated_staff() or public.coaches_team(team_id));

drop policy if exists "mpm upsert" on public.match_player_minutes;
create policy "mpm upsert" on public.match_player_minutes
  for insert to authenticated
  with check (public.is_admin() or public.is_elevated_staff() or public.coaches_team(team_id));

-- vald_forceframe_results had RLS enabled but no SELECT policy, so only the
-- service role (server-side snapshot) could read it; coach/player client
-- queries returned nothing (the coach VALD tab + player tab showed no ForceFrame
-- data even though rows existed). Mirror the two vald_nordbord_results read
-- policies so coaches see their team's tests and players see their own.
alter table public.vald_forceframe_results enable row level security;

drop policy if exists vald_forceframe_coach_read_team on public.vald_forceframe_results;
create policy vald_forceframe_coach_read_team on public.vald_forceframe_results
  for select to public
  using (
    exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and lower(coalesce(pr.role, '')) = any (array['coach', 'admin', 'staff'])
        and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = vald_forceframe_results.team_id)
    )
  );

drop policy if exists vald_forceframe_player_select_own on public.vald_forceframe_results;
create policy vald_forceframe_player_select_own on public.vald_forceframe_results
  for select to public
  using (
    exists (
      select 1 from public.players p
      where p.id = vald_forceframe_results.microplayer_id and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid() and pr.player_id = vald_forceframe_results.microplayer_id
    )
  );

-- vald_test_metrics (long-form IMTP/DJ/etc. result set) had RLS enabled but only
-- a service_role policy, so coach/player client queries returned nothing. The
-- player VALD tab now surfaces IMTP early-force + RFD context from this table, so
-- mirror the vald_forceframe_results read policies: coaches see their team's
-- tests, players see their own.
alter table public.vald_test_metrics enable row level security;

drop policy if exists vald_test_metrics_coach_read_team on public.vald_test_metrics;
create policy vald_test_metrics_coach_read_team on public.vald_test_metrics
  for select to public
  using (
    exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid()
        and lower(coalesce(pr.role, '')) = any (array['coach', 'admin', 'staff'])
        and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = vald_test_metrics.team_id)
    )
  );

drop policy if exists vald_test_metrics_player_select_own on public.vald_test_metrics;
create policy vald_test_metrics_player_select_own on public.vald_test_metrics
  for select to public
  using (
    exists (
      select 1 from public.players p
      where p.id = vald_test_metrics.microplayer_id and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.profiles pr
      where pr.id = auth.uid() and pr.player_id = vald_test_metrics.microplayer_id
    )
  );

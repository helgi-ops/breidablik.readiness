-- Per-team Mohr multiplying-factor overrides for the four-category drill/session
-- load profile (drillLoadProfile.ts). One row per team holding the full LoadFactors
-- object as JSONB; absent/partial → the code merges over DEFAULT_LOAD_FACTORS, so a
-- team with no row simply uses the defaults. The factors are a coaching philosophy
-- (Mohr's heuristic, tunable), NOT a validated instrument — descriptive only; nothing
-- here touches the readiness colour, the load target, or the daily decision.

create table if not exists public.team_load_factors (
  team_id uuid primary key references public.teams(id) on delete cascade,
  factors jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

alter table public.team_load_factors enable row level security;

-- Coach/admin/staff of the team: read + write (mirrors player_strength_set_log).
create policy team_load_factors_coach_read on public.team_load_factors for select using (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = team_load_factors.team_id
         or team_load_factors.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))));
create policy team_load_factors_coach_write on public.team_load_factors for all using (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = team_load_factors.team_id
         or team_load_factors.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))))
  with check (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = team_load_factors.team_id
         or team_load_factors.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))));

drop trigger if exists trg_team_load_factors_set_updated_at on public.team_load_factors;
create trigger trg_team_load_factors_set_updated_at
  before update on public.team_load_factors
  for each row execute function public.set_updated_at();

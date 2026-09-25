-- Player-marked completions for the off-week / holiday maintenance plan. One row per completed day
-- (player + week + day_index). The player taps "done" on their own plan (dedicated /player/off-week
-- page + Strength tab); writes go through the service-role API that verifies ownership. Coaches can
-- read their team's completions (future adherence view). Descriptive — nothing here touches readiness.
create table if not exists public.player_off_week_completions (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  team_id      uuid not null references public.teams(id) on delete cascade,
  week_start   date not null,
  day_index    integer not null,
  completed_at timestamptz not null default now(),
  unique (player_id, week_start, day_index)
);

create index if not exists player_off_week_completions_team_week_idx
  on public.player_off_week_completions (team_id, week_start desc);

alter table public.player_off_week_completions enable row level security;

-- Coaches read their own team's completions; the service-role API (used by the player) bypasses RLS.
drop policy if exists player_off_week_completions_coach_read on public.player_off_week_completions;
create policy player_off_week_completions_coach_read on public.player_off_week_completions
  for select
  using (exists (select 1 from public.coach_teams ct where ct.team_id = player_off_week_completions.team_id and ct.coach_id = auth.uid()));

grant select, insert, update, delete on public.player_off_week_completions to authenticated;
grant select, insert, update, delete on public.player_off_week_completions to service_role;

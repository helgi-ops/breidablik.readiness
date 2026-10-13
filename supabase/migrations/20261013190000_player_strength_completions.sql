-- Player-marked completion of today's strength session. One row per completed day (player + date).
-- The player taps "done" on their own Today card; writes go through the service-role API that verifies
-- ownership (mirrors player_off_week_completions). Coaches can read their team's completions. Reopening
-- deletes the row. Descriptive — nothing here touches readiness, the decision, or the delivery override.
create table if not exists public.player_strength_completions (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  team_id      uuid not null references public.teams(id) on delete cascade,
  entry_date   date not null,
  completed_at timestamptz not null default now(),
  source       text,
  unique (player_id, entry_date)
);

create index if not exists player_strength_completions_team_date_idx
  on public.player_strength_completions (team_id, entry_date desc);

alter table public.player_strength_completions enable row level security;

-- Coaches read their own team's completions; the service-role API (used by the player) bypasses RLS.
drop policy if exists player_strength_completions_coach_read on public.player_strength_completions;
create policy player_strength_completions_coach_read on public.player_strength_completions
  for select
  using (exists (select 1 from public.coach_teams ct where ct.team_id = player_strength_completions.team_id and ct.coach_id = auth.uid()));

grant select, insert, update, delete on public.player_strength_completions to authenticated;
grant select, insert, update, delete on public.player_strength_completions to service_role;

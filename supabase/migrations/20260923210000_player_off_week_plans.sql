-- Off-week / holiday maintenance plans sent to players (strength + running, self-guided).
-- One coach-sent plan per player per week; the player reads the saved copy in the app (offline once
-- loaded). Descriptive/advisory — self-guided RPE/time/distance prescriptions; nothing here writes
-- readiness_entries.color. Mirrors player_training_programmes' RLS pattern.
create table if not exists public.player_off_week_plans (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  team_id      uuid not null references public.teams(id) on delete cascade,
  week_start   date not null,
  days         integer not null default 7,
  gym_access   text not null default 'gym',
  plan         jsonb not null default '{}'::jsonb,  -- the OffWeekPlan (days + summary + caveat + why)
  needs        jsonb not null default '{}'::jsonb,  -- the per-player needs profile used
  sent_by      uuid,
  sent_at      timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (player_id, week_start)
);

create index if not exists player_off_week_plans_team_week_idx
  on public.player_off_week_plans (team_id, week_start desc);

alter table public.player_off_week_plans enable row level security;

-- Coaches read/write plans for their own team; the service-role API bypasses RLS. The player reads
-- via a service-role API that verifies ownership, so no separate player policy is needed.
drop policy if exists player_off_week_plans_coach_rw on public.player_off_week_plans;
create policy player_off_week_plans_coach_rw on public.player_off_week_plans
  for all
  using (exists (select 1 from public.coach_teams ct where ct.team_id = player_off_week_plans.team_id and ct.coach_id = auth.uid()))
  with check (exists (select 1 from public.coach_teams ct where ct.team_id = player_off_week_plans.team_id and ct.coach_id = auth.uid()));

grant select, insert, update, delete on public.player_off_week_plans to authenticated;
grant select, insert, update, delete on public.player_off_week_plans to service_role;

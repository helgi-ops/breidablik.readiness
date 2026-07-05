-- Return-to-training plans: one coach-editable plan per player, with an override
-- audit trail. The engine computes a suggested plan; the coach can edit targets
-- and each edit is logged (quality, week, from, to, reason, by, at) in overrides.
create table if not exists public.rtt_plans (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players(id) on delete cascade,
  team_id       uuid not null references public.teams(id) on delete cascade,
  rtt_start_date date,
  weeks         jsonb not null default '[]'::jsonb,   -- coach-saved per-week targets
  overrides     jsonb not null default '[]'::jsonb,   -- audit trail of edits
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (player_id)
);

alter table public.rtt_plans enable row level security;

-- A coach may read/write plans only for teams they belong to (service-role API
-- bypasses RLS; this protects any direct client access).
drop policy if exists rtt_plans_coach_rw on public.rtt_plans;
create policy rtt_plans_coach_rw on public.rtt_plans
  for all
  using (exists (select 1 from public.coach_teams ct where ct.team_id = rtt_plans.team_id and ct.coach_id = auth.uid()))
  with check (exists (select 1 from public.coach_teams ct where ct.team_id = rtt_plans.team_id and ct.coach_id = auth.uid()));

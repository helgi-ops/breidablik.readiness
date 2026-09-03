-- Periodization Hub — season macro/meso plan, one per team+season. The plan is GENERATED from the
-- team's own data (fixtures, load curve, readiness); these tables persist the coach's saved/edited
-- version (overrides). The micro layer stays in the existing week_plans (not duplicated here).
-- Descriptive planning — periodization sets the plan; it NEVER overrides the daily readiness colour.
create table if not exists public.season_plans (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  season_year  int  not null,
  name         text,
  overrides    jsonb not null default '{}'::jsonb,  -- coach edits to phase boundaries/goals
  generated_at timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  unique (team_id, season_year)
);

-- One meso block (4–6 wk) of a season plan. Ordered by block_index; targets holds the derived
-- volume/emphasis/strength/endurance recommendation as jsonb.
create table if not exists public.season_plan_blocks (
  id             uuid primary key default gen_random_uuid(),
  season_plan_id uuid not null references public.season_plans(id) on delete cascade,
  team_id        uuid not null references public.teams(id) on delete cascade,
  block_index    int  not null,
  phase          text,                                -- accumulation / transmutation / realization / off
  goal           text,
  start_date     date,
  end_date       date,
  is_deload      boolean not null default false,
  targets        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (season_plan_id, block_index)
);

create index if not exists season_plan_blocks_plan_idx on public.season_plan_blocks (season_plan_id, block_index);

alter table public.season_plans enable row level security;
alter table public.season_plan_blocks enable row level security;

drop policy if exists season_plans_coach_rw on public.season_plans;
create policy season_plans_coach_rw on public.season_plans for all
  using (exists (select 1 from public.coach_teams ct where ct.team_id = season_plans.team_id and ct.coach_id = auth.uid()))
  with check (exists (select 1 from public.coach_teams ct where ct.team_id = season_plans.team_id and ct.coach_id = auth.uid()));

drop policy if exists season_plan_blocks_coach_rw on public.season_plan_blocks;
create policy season_plan_blocks_coach_rw on public.season_plan_blocks for all
  using (exists (select 1 from public.coach_teams ct where ct.team_id = season_plan_blocks.team_id and ct.coach_id = auth.uid()))
  with check (exists (select 1 from public.coach_teams ct where ct.team_id = season_plan_blocks.team_id and ct.coach_id = auth.uid()));

grant select, insert, update, delete on public.season_plans to authenticated, service_role;
grant select, insert, update, delete on public.season_plan_blocks to authenticated, service_role;

-- ============================================================
-- Training Plan Templates — reusable blueprints
-- ============================================================
-- Allows trainers to create and manage reusable plan templates
-- with a JSONB structure field for weeks/sessions/exercises.

create table if not exists public.training_plan_templates (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id),
  created_by      uuid not null references auth.users(id),
  plan_name       text not null,
  plan_type       text not null check (plan_type in ('strength','endurance','mixed')),
  duration_weeks  integer not null check (duration_weeks > 0),
  sessions_per_week integer not null check (sessions_per_week between 1 and 7),
  readiness_enabled       boolean not null default true,
  readiness_red_action    text not null default 'recovery'
    check (readiness_red_action in ('skip','recovery','deload')),
  readiness_yellow_action text not null default 'deload'
    check (readiness_yellow_action in ('normal','deload')),
  deload_volume_pct       integer not null default 70,
  deload_intensity_pct    integer not null default 85,
  structure       jsonb not null default '[]'::jsonb,  -- Array of weeks with sessions and exercises
  notes           text,
  is_public       boolean not null default false,      -- can be used as global template
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_tpt_team on public.training_plan_templates(team_id);
create index if not exists idx_tpt_created_by on public.training_plan_templates(created_by);
create index if not exists idx_tpt_plan_type on public.training_plan_templates(plan_type);

alter table public.training_plan_templates enable row level security;

comment on table public.training_plan_templates is
  'Reusable training plan templates with JSONB structure for weeks/sessions/exercises.';

comment on column public.training_plan_templates.structure is
  'JSONB array of weeks: [{ week: 1, sessions: [{ dayOfWeek, name, type, exercises: [...] }] }, ...]';

-- Policies: coaches can see/create templates for their team, staff sees all
create policy tpt_select on public.training_plan_templates
  for select using (
    exists (
      select 1 from coach_teams ct
      where ct.coach_id = auth.uid() and ct.team_id = training_plan_templates.team_id
    )
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

create policy tpt_insert on public.training_plan_templates
  for insert with check (
    exists (
      select 1 from coach_teams ct
      where ct.coach_id = auth.uid() and ct.team_id = training_plan_templates.team_id
    )
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

create policy tpt_update on public.training_plan_templates
  for update using (
    created_by = auth.uid()
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

create policy tpt_delete on public.training_plan_templates
  for delete using (
    created_by = auth.uid()
    or exists (select 1 from staff_users su where su.user_id = auth.uid())
  );

-- Trigger for updated_at
create or replace trigger trg_tpt_updated
  before update on public.training_plan_templates
  for each row execute function extensions.moddatetime(updated_at);

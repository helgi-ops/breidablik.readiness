-- Drill Library (team-scoped)
-- Coaches can create/edit/delete their own team's drills. Seed/catapult/public_template
-- drills are also stored here. A separate drill_library_public table holds research-backed
-- templates that can be copied into any team's library via parent_template_id.

create table if not exists public.drill_library (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  category        text not null check (category in ('possession','ssg','transition','running','finishing','warmup','other')),
  drill_name      text not null,
  description     text,
  drill_format    text,

  field_length_m  numeric(5,1),
  field_width_m   numeric(5,1),
  total_players   int,
  reps            text,

  field_area_m2        numeric(7,1) generated always as (field_length_m * field_width_m) stored,
  area_per_player_m2   numeric(7,2) generated always as (
    case when total_players > 0 and field_length_m is not null and field_width_m is not null
         then (field_length_m * field_width_m) / total_players
         else null end
  ) stored,

  duration_min         numeric(5,2),
  distance_m           numeric(7,1),
  vel_b5               numeric(6,1),
  vel_b6               numeric(6,1),
  hir_total            numeric(7,1),
  player_load          numeric(7,1),
  player_load_per_min  numeric(5,2),
  accel_b23            numeric(5,1),
  decel_b23            numeric(5,1),

  source              text not null default 'coach' check (source in ('seed','coach','catapult','public_template')),
  parent_template_id  uuid,  -- references public.drill_library_public(id), FK added in later migration
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create index if not exists drill_library_team_idx
  on public.drill_library(team_id) where deleted_at is null;

create index if not exists drill_library_team_category_idx
  on public.drill_library(team_id, category) where deleted_at is null;

create index if not exists drill_library_parent_template_idx
  on public.drill_library(parent_template_id) where parent_template_id is not null;

-- updated_at trigger
create or replace function public.drill_library_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_drill_library_updated_at on public.drill_library;
create trigger trg_drill_library_updated_at
  before update on public.drill_library
  for each row execute function public.drill_library_set_updated_at();

-- RLS
alter table public.drill_library enable row level security;

drop policy if exists drill_library_select on public.drill_library;
create policy drill_library_select on public.drill_library
  for select using (
    exists (
      select 1 from public.coach_teams ct
      where ct.team_id = drill_library.team_id and ct.coach_id = auth.uid()
    )
    or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
  );

drop policy if exists drill_library_insert on public.drill_library;
create policy drill_library_insert on public.drill_library
  for insert with check (
    exists (
      select 1 from public.coach_teams ct
      where ct.team_id = drill_library.team_id and ct.coach_id = auth.uid()
    )
    or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
  );

drop policy if exists drill_library_update on public.drill_library;
create policy drill_library_update on public.drill_library
  for update using (
    exists (
      select 1 from public.coach_teams ct
      where ct.team_id = drill_library.team_id and ct.coach_id = auth.uid()
    )
    or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
  );

drop policy if exists drill_library_delete on public.drill_library;
create policy drill_library_delete on public.drill_library
  for delete using (
    exists (select 1 from public.staff_users su where su.user_id = auth.uid())
  );

comment on table public.drill_library is 'Team-scoped drill library with GPS load metrics. Coaches can add/edit/soft-delete their own drills. Seed drills from Excel, catapult imports, and copied public templates also live here.';
comment on column public.drill_library.area_per_player_m2 is 'Computed field area / total_players — key SSG/possession load driver (see Fradua 2013).';
comment on column public.drill_library.parent_template_id is 'If copied from drill_library_public, points to the source template.';

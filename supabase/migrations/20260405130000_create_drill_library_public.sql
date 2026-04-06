-- Public drill library: research-backed SSG templates (admin-managed, read-only for coaches)
-- Coaches can copy a template into their team library, creating a row in drill_library
-- with source='public_template' and parent_template_id pointing back here.

-- 1) Add parent_template_id + update source enum on drill_library
alter table public.drill_library
  drop constraint if exists drill_library_source_check;

alter table public.drill_library
  add constraint drill_library_source_check
  check (source in ('seed','coach','catapult','public_template'));

alter table public.drill_library
  add column if not exists parent_template_id uuid;

create index if not exists drill_library_parent_template_idx
  on public.drill_library(parent_template_id) where parent_template_id is not null;

-- 2) Create drill_library_public
create table if not exists public.drill_library_public (
  id              uuid primary key default gen_random_uuid(),
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

  -- Research-specific fields
  hr_pct_max           numeric(4,1),   -- % of HRmax (Rampinini)
  blood_lactate_mmol   numeric(4,2),   -- mmol/L
  rpe_cr10             numeric(3,1),   -- Borg CR-10
  coach_encouragement  boolean,

  source_citation      text,            -- e.g. "Rampinini et al. 2007"
  source_doi           text,
  tags                 text[],          -- e.g. {'aerobic','intermittent','endurance'}

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists drill_library_public_category_idx
  on public.drill_library_public(category);

-- updated_at trigger (reuse function)
drop trigger if exists trg_drill_library_public_updated_at on public.drill_library_public;
create trigger trg_drill_library_public_updated_at
  before update on public.drill_library_public
  for each row execute function public.drill_library_set_updated_at();

-- 3) Add FK from drill_library.parent_template_id → drill_library_public.id
alter table public.drill_library
  drop constraint if exists drill_library_parent_template_fk;
alter table public.drill_library
  add constraint drill_library_parent_template_fk
  foreign key (parent_template_id)
  references public.drill_library_public(id) on delete set null;

-- 4) RLS: anyone authenticated can read, only staff can write
alter table public.drill_library_public enable row level security;

drop policy if exists drill_library_public_select on public.drill_library_public;
create policy drill_library_public_select on public.drill_library_public
  for select using (auth.role() = 'authenticated');

drop policy if exists drill_library_public_insert on public.drill_library_public;
create policy drill_library_public_insert on public.drill_library_public
  for insert with check (
    exists (select 1 from public.staff_users su where su.user_id = auth.uid())
  );

drop policy if exists drill_library_public_update on public.drill_library_public;
create policy drill_library_public_update on public.drill_library_public
  for update using (
    exists (select 1 from public.staff_users su where su.user_id = auth.uid())
  );

drop policy if exists drill_library_public_delete on public.drill_library_public;
create policy drill_library_public_delete on public.drill_library_public
  for delete using (
    exists (select 1 from public.staff_users su where su.user_id = auth.uid())
  );

comment on table public.drill_library_public is 'Research-backed SSG templates (read-only for coaches, admin-managed). Copied into team drill_library on demand.';

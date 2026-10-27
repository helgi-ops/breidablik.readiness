-- Training camps (æfingaferð) — a coach-declared CONCENTRATED-LOAD period (the opposite of a team_break).
-- During a camp the macro/meso treat the days as an accumulation loading block: each training day's load is
-- bumped by load_pct, and when two_a_day is set the rest days become extra sessions. Descriptive planning —
-- never the readiness colour. Declared by the coach; all access via service-role coach endpoints.
create table if not exists public.team_camps (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  label text,
  load_pct int not null default 15,          -- extra load during the camp, % on top of the normal day
  two_a_day boolean not null default false,  -- extra sessions: camp rest days become training days
  created_by uuid,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (load_pct between 0 and 60)
);

create index if not exists team_camps_team_dates_idx
  on public.team_camps (team_id, start_date, end_date);

comment on table public.team_camps is
  'Coach-declared training camps (concentrated-load periods). During a camp training-day load is bumped by load_pct and, when two_a_day is set, rest days become extra sessions. The opposite of team_breaks. All access via service-role coach endpoints.';

alter table public.team_camps enable row level security;

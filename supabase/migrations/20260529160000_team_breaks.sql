-- Declared team rest periods (breaks). During a break the system suppresses
-- check-in/RPE reminders, doesn't penalise streak/compliance, and doesn't flag
-- missed check-ins. The coach declares it; players get a real break.
create table if not exists public.team_breaks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  label text,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists team_breaks_team_dates_idx
  on public.team_breaks (team_id, start_date, end_date);

comment on table public.team_breaks is
  'Declared rest periods for a team. During a break the system suppresses check-in/RPE reminders, does not penalise streak/compliance, and does not flag missed check-ins. The coach declares it; players get a real break.';

-- All access via service-role coach endpoints.
alter table public.team_breaks enable row level security;

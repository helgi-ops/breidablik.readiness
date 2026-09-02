-- Player MD-periodised training programme ("Æfingavika"): one coach-generated,
-- coach-editable microcycle per player per week, plus an override audit trail.
-- The engine (microcycleProgramme) computes the week from live data; the coach can
-- save/edit it and the player reads the saved copy. Descriptive/advisory — the days
-- carry a PLANNED-load colour, never the readiness verdict; nothing here writes
-- readiness_entries.color. Mirrors the rtt_plans pattern.
create table if not exists public.player_training_programmes (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references public.players(id) on delete cascade,
  team_id      uuid not null references public.teams(id) on delete cascade,
  week_start   date not null,
  days         jsonb not null default '[]'::jsonb,  -- the generated/edited MicrocycleDay[]
  overrides    jsonb not null default '[]'::jsonb,  -- audit trail of coach edits
  generated_at timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  unique (player_id, week_start)
);

create index if not exists player_training_programmes_team_week_idx
  on public.player_training_programmes (team_id, week_start desc);

alter table public.player_training_programmes enable row level security;

-- Coaches read/write plans for their own team; the service-role API bypasses RLS
-- (this protects any direct client access). The player reads via a service-role API
-- that verifies ownership, so no separate player policy is needed.
drop policy if exists player_training_programmes_coach_rw on public.player_training_programmes;
create policy player_training_programmes_coach_rw on public.player_training_programmes
  for all
  using (exists (select 1 from public.coach_teams ct where ct.team_id = player_training_programmes.team_id and ct.coach_id = auth.uid()))
  with check (exists (select 1 from public.coach_teams ct where ct.team_id = player_training_programmes.team_id and ct.coach_id = auth.uid()));

grant select, insert, update, delete on public.player_training_programmes to authenticated;
grant select, insert, update, delete on public.player_training_programmes to service_role;

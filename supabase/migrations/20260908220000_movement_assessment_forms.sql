-- Movement Screening Assessment Form store — the coach records structured
-- observations across a battery of movement tests (observation → hypothesis →
-- confirmation schema, 8-domain tagged), which feed the deficit ledger. Mirrors
-- the movement_screens RLS (team-scoped; coach/staff). Screening/training only —
-- never a diagnosis, never the readiness colour; pain/red-flags → clinician.
create table if not exists movement_assessment_forms (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  assessment_date date not null default current_date,
  battery text[] not null default '{}',       -- catalogue slugs assessed
  results jsonb not null default '{}'::jsonb,  -- per-test raw record (observationKeys, sides, pain, measurements)
  fired jsonb not null default '[]'::jsonb,    -- FiredObservation[] (denormalised for the ledger)
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists movement_assessment_forms_player_idx
  on movement_assessment_forms (player_id, assessment_date desc);

alter table movement_assessment_forms enable row level security;
drop policy if exists movement_assessment_forms_rw on movement_assessment_forms;
create policy movement_assessment_forms_rw on movement_assessment_forms for all
  using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());

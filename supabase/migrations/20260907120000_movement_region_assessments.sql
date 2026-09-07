-- Region-based movement assessment (OsteoSport-style) — the coach records each
-- assessable field of a body region (the region + priority fields are seeded by
-- the AI analysis carry-over). Complements the test-based movement_screens.
-- Screening / training only — never a diagnosis, never the readiness colour.
create table if not exists movement_region_assessments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  assessment_date date not null,
  region text not null,                              -- a RegionKey from the engine
  fields jsonb not null default '[]'::jsonb,         -- [{ fieldId, severity, note }]
  pain_reported boolean not null default false,
  from_carryover boolean not null default false,     -- seeded by the AI analysis
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists movement_region_assessments_team_idx on movement_region_assessments (team_id);
create index if not exists movement_region_assessments_player_idx on movement_region_assessments (player_id);

alter table movement_region_assessments enable row level security;
drop policy if exists movement_region_assessments_rw on movement_region_assessments;
create policy movement_region_assessments_rw on movement_region_assessments for all
  using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());

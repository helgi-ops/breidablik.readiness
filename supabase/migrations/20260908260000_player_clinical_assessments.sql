-- Clinical assessment store — the King "Initial Ax" (ROM / strength 0-5 / global
-- movement, scored R/L with a pain flag). A CLINICIAN records it; its flagged
-- fields write CONFIRMED deficits into the unified ledger. Consent- and
-- access-gated like the other assessment stores. Screening / rehab-support only —
-- never the readiness colour; pain / red flags stay with the clinician.
create table if not exists player_clinical_assessments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  assessment_date date not null default current_date,
  fields jsonb not null default '[]'::jsonb,   -- [{ fieldId, group, scoreR, scoreL, pain, flag }]
  pain_reported boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists player_clinical_assessments_player_idx on player_clinical_assessments (player_id, assessment_date desc);

alter table player_clinical_assessments enable row level security;
drop policy if exists player_clinical_assessments_rw on player_clinical_assessments;
create policy player_clinical_assessments_rw on player_clinical_assessments for all
  using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());

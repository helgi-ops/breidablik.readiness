-- Unified deficit ledger — the single per-player "what's off + how sure are we".
-- Automated sources (movement screen, screening form, VALD, …) are read live and
-- reconciled; this table PERSISTS the durable rows: coach overrides, manual /
-- clinical-assessment deficits, and optional snapshots. Every row carries domain,
-- severity, status (hypothesis/confirmed), confidence, provenance, evidence grade
-- and lever. Descriptive/advisory — NEVER the readiness colour; pain / red flags →
-- clinician; movement-screen qualities are hypotheses, not diagnoses.
create table if not exists player_deficits (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  quality text not null,                 -- controlled QualityKey
  region text,
  side text,                             -- L | R | both
  domain text,                           -- one of the 8 result domains
  severity text,                         -- mild | moderate | severe
  value numeric,                         -- cm/deg/%/RSI/LSI/count where measured
  status text not null default 'hypothesis',  -- hypothesis | confirmed | monitoring | resolved
  confidence numeric,                    -- 0..1
  source text not null,                  -- movement_screen | movement_form | vald | vbt | ima | load | clinical_ax | rehab_track | coach_override
  source_detail text,
  assessment_date date not null default current_date,
  evidence_grade text,                   -- strong | moderate | emerging | experimental
  lever text,                            -- how to address (corrective/rehab link)
  confirmation_tests_outstanding text[] not null default '{}',
  coach_override text,                   -- dismiss | confirm (when source = coach_override)
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists player_deficits_player_idx on player_deficits (player_id, assessment_date desc);

alter table player_deficits enable row level security;
drop policy if exists player_deficits_rw on player_deficits;
create policy player_deficits_rw on player_deficits for all
  using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());

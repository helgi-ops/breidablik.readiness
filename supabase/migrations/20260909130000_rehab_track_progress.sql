-- Persisted, clinician-gated phase progression for the movement-quality rehab
-- tracks (rehabTracks.ts: acl_knee / athletic_groin / ankle / lumbar_spine).
-- The track DEFINITIONS stay in code; this persists WHERE a player is on the
-- continuum and an audit trail of every advance/regress/discharge. Nothing
-- auto-advances — the treating clinician gates every step; criteria are never
-- auto-evaluated as met. Rehab-support only — never a diagnosis, never a
-- clearance, never the readiness colour. Pain / red flags -> clinician.
-- RLS mirrors player_deficits (coach_team_ids() or is_staff()).

-- One active-ish row per player x track (the tracked current phase + status).
create table if not exists rehab_track_progress (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  track_key text not null,                    -- acl_knee | athletic_groin | ankle | lumbar_spine
  current_phase_key text not null,            -- matches a RehabPhase.key in rehabTracks.ts
  status text not null default 'active',      -- active | paused | completed | discharged
  entered_current_phase_at date not null default current_date,
  started_at date not null default current_date,
  note text,
  created_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- One ACTIVE track per player x track_key (a player can complete one and start
-- another; only one non-terminal row per track at a time).
create unique index if not exists rehab_track_progress_active_uidx
  on rehab_track_progress (player_id, track_key)
  where status in ('active', 'paused');

create index if not exists rehab_track_progress_player_idx on rehab_track_progress (player_id, updated_at desc);

alter table rehab_track_progress enable row level security;
drop policy if exists rehab_track_progress_rw on rehab_track_progress;
create policy rehab_track_progress_rw on rehab_track_progress for all
  using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());

-- The audit trail — every phase transition, with the criteria judged met and a
-- required reason (manifesto: overrides/advances logged with a reason).
create table if not exists rehab_phase_events (
  id uuid primary key default gen_random_uuid(),
  progress_id uuid not null references rehab_track_progress(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  track_key text not null,
  from_phase_key text,
  to_phase_key text,
  action text not null,                       -- enter | advance | regress | criterion_met | discharge | pause | resume
  criteria_met text[] not null default '{}',  -- which ExitCriterion labels were judged met
  reason text,                                -- required for advance/regress/discharge (enforced app-side)
  decided_by uuid references profiles(id) on delete set null,
  event_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists rehab_phase_events_progress_idx on rehab_phase_events (progress_id, created_at desc);
create index if not exists rehab_phase_events_player_idx on rehab_phase_events (player_id, created_at desc);

alter table rehab_phase_events enable row level security;
drop policy if exists rehab_phase_events_rw on rehab_phase_events;
create policy rehab_phase_events_rw on rehab_phase_events for all
  using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());

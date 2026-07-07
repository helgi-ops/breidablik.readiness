-- Clinical / physio report uploads: AI reads the PDF, a human confirms, then it
-- files into the player's injury history + a risk/asymmetry watch-list. Health
-- data — team-scoped RLS, private storage, human-in-the-loop (nothing auto-written).

create table if not exists public.clinical_reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,  -- nullable: can upload before the player exists
  player_name_raw text,                                             -- name as written on the report, for later auto-link
  report_date date,
  clinician_name text,
  clinician_licence text,
  clinic text,
  clinician_email text,
  file_path text not null,
  file_name text,
  raw_text text,                                                    -- extracted text (source-of-truth for the "cite the source" UI)
  extracted_json jsonb,                                             -- AI-proposed structure (never authoritative until confirmed)
  status text not null default 'uploaded' check (status in ('uploaded','extracted','confirmed')),
  uploaded_by uuid,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists clinical_reports_team_idx on public.clinical_reports(team_id);
create index if not exists clinical_reports_player_idx on public.clinical_reports(player_id);
create index if not exists clinical_reports_unlinked_idx on public.clinical_reports(team_id, player_name_raw) where player_id is null;

create table if not exists public.player_risk_flags (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  flag text not null,
  side text check (side in ('left','right','bilateral')),
  category text,                                                    -- 'clinical_finding' | 'prevention_target' | 'asymmetry' | 'return_to_play'
  source_report_id uuid references public.clinical_reports(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists player_risk_flags_player_idx on public.player_risk_flags(player_id) where active;

alter table public.injury_events add column if not exists source_clinical_report_id uuid references public.clinical_reports(id) on delete set null;

insert into storage.buckets (id, name, public) values ('clinical-reports', 'clinical-reports', false)
  on conflict (id) do nothing;

alter table public.clinical_reports enable row level security;
alter table public.player_risk_flags enable row level security;

create policy clinical_reports_rw on public.clinical_reports for all
  using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());

create policy player_risk_flags_rw on public.player_risk_flags for all
  using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());

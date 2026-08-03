-- Coach-assessed dynamic-valgus observation for the RTP report. Video valgus is
-- NOT auto-analysed (no CV pipeline) — this is a manual clinical input, clearly
-- labelled as coach-assessed in the report. One row per player per assessment date.
create table if not exists public.rtp_valgus_assessments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  team_id uuid,
  assessment_date date not null default current_date,
  severity text not null default 'none',   -- none | mild | moderate | severe
  note text,
  coach_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, assessment_date)
);

create index if not exists idx_rtp_valgus_player on public.rtp_valgus_assessments (player_id, assessment_date desc);

alter table public.rtp_valgus_assessments enable row level security;
drop policy if exists rtp_valgus_service_all on public.rtp_valgus_assessments;
create policy rtp_valgus_service_all on public.rtp_valgus_assessments
  for all to service_role using (true) with check (true);

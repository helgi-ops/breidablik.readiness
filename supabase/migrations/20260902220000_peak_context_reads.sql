-- Persisted peak-context FUSION reads (Ju 2022 physical × tactical). The coach uploads a
-- match's Wyscout SportsCode XML; the route aligns the Catapult peak windows to the events
-- and computes, per player, his tactical actions in each peak window + the team's phase.
-- That result was compute-only (vanished on reload) — this table saves it per team+match so
-- the team overview + per-player bars reappear on page load without re-uploading.
-- Payload is the computed response (players[], hasStarterData, counts, note, clock params).
-- Descriptive tactical context — nothing here reads or writes readiness_entries.color.
create table if not exists public.peak_context_reads (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  match_date  date not null,
  payload     jsonb not null default '{}'::jsonb,  -- the computed fusion response for the match
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (team_id, match_date)
);

create index if not exists peak_context_reads_team_date_idx
  on public.peak_context_reads (team_id, match_date desc);

alter table public.peak_context_reads enable row level security;

-- Coaches read/write reads for their own team; the service-role API bypasses RLS
-- (this protects any direct client access).
drop policy if exists peak_context_reads_coach_rw on public.peak_context_reads;
create policy peak_context_reads_coach_rw on public.peak_context_reads
  for all
  using (exists (select 1 from public.coach_teams ct where ct.team_id = peak_context_reads.team_id and ct.coach_id = auth.uid()))
  with check (exists (select 1 from public.coach_teams ct where ct.team_id = peak_context_reads.team_id and ct.coach_id = auth.uid()));

grant select, insert, update, delete on public.peak_context_reads to authenticated;
grant select, insert, update, delete on public.peak_context_reads to service_role;

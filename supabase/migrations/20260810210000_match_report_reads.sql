-- Saved AI briefings of an uploaded match-report PDF, so the coach doesn't have to
-- re-upload (and re-run the model) to see the read again. One row per (team, match_date);
-- re-reading a report for the same match updates it. `read` is the model's JSON briefing
-- (headline, summary, phases, key moments, stat highlights, went-well/to-improve, key
-- players, tactical, opponent). Descriptive AI context — it writes no stats and never
-- touches the readiness colour, load, or the daily decision. The source PDF is NOT stored.
-- Applied via mcp apply_migration; committed here per the repo rule that every applied
-- migration is reproducible.
create table if not exists public.match_report_reads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  match_date date not null,
  read jsonb not null,
  source_name text,
  model text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, match_date)
);

create index if not exists match_report_reads_team_date_idx on public.match_report_reads (team_id, match_date);

alter table public.match_report_reads enable row level security;

-- Coach/staff/admin of the team may read.
create policy "match_report_reads_coach_read" on public.match_report_reads
for select using (
  team_id in (select coach_team_ids()) or is_staff()
);
-- ...and save/update the read for their own team.
create policy "match_report_reads_coach_insert" on public.match_report_reads
for insert with check (team_id in (select coach_team_ids()) or is_staff());
create policy "match_report_reads_coach_update" on public.match_report_reads
for update using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());

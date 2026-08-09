-- Final scores for basketball games, entered by the coach (the KKÍ/Instat box-score
-- feed carries own-team per-player stats but not the opponent total / result). One row
-- per (team, KKÍ game_id). points_for may be left null and computed from the box score;
-- points_against is what the coach enters. Descriptive context for Season Match Analysis
-- (win/loss + margin) — it never touches the readiness colour, load, or the daily decision.
-- Applied via mcp apply_migration; committed here per the repo rule that every applied
-- migration is reproducible.
create table if not exists public.basketball_game_results (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  game_id text not null,
  game_date date,
  opponent text,
  points_for integer,
  points_against integer,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, game_id)
);

create index if not exists basketball_game_results_team_idx on public.basketball_game_results (team_id);

alter table public.basketball_game_results enable row level security;

-- Coach/staff/admin of the team may read.
create policy "basketball_game_results_coach_read" on public.basketball_game_results
for select using (
  team_id in (select coach_team_ids()) or is_staff()
);
-- ...and enter/correct results for their own team.
create policy "basketball_game_results_coach_insert" on public.basketball_game_results
for insert with check (team_id in (select coach_team_ids()) or is_staff());
create policy "basketball_game_results_coach_update" on public.basketball_game_results
for update using (team_id in (select coach_team_ids()) or is_staff())
  with check (team_id in (select coach_team_ids()) or is_staff());

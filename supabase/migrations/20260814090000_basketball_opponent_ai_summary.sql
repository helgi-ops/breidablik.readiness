-- Per-opponent AI scouting summary for basketball Opponent Analysis (the counterpart
-- of the single-game ai_summary stored on the game row). One row per (team, opponent);
-- the POST route generates it from the InStat/KKÍ scouting numbers and upserts here so a
-- revisit needs no re-run. Descriptive AI, labelled as such — never touches readiness.
-- Only the service-role server route reads/writes this, so RLS is enabled with no policy
-- (deny by default for anon/authenticated; service role bypasses).
create table if not exists public.basketball_opponent_ai_summary (
  id uuid primary key default gen_random_uuid(),
  owner_team_id uuid not null references public.teams(id) on delete cascade,
  opponent_name text not null,
  summary jsonb not null,
  model text,
  generated_at timestamptz not null default now(),
  unique (owner_team_id, opponent_name)
);
alter table public.basketball_opponent_ai_summary enable row level security;

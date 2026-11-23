-- History of the coach's exercise swaps (contradiction 18, coach's call 2026-11-23).
--
-- strength_session_overrides holds the swap in force: one row per (player, day, block, position), overwritten by a
-- re-swap and deleted when the coach takes it back, so nothing showed what was changed, by whom or why. This log is
-- append-only: one row each time a swap is set, changed or taken back, with the coach's one-tap reason (`code` or
-- `code: note`, see src/lib/micropulse/strengthProgramming/coachReasons.ts).
--
-- Server-only like strength_session_overrides: written by the strength-override route with the service role. RLS
-- on, no policies for anon / authenticated.

create table if not exists public.strength_session_override_log (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  override_date date not null,
  block_id text not null,
  position int not null check (position >= 0),
  action text not null check (action in ('set', 'clear')),
  from_exercise_id text,
  to_exercise_id text,
  reason text not null,
  coach_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists strength_session_override_log_player_date_idx
  on public.strength_session_override_log (player_id, override_date);
create index if not exists strength_session_override_log_team_created_idx
  on public.strength_session_override_log (team_id, created_at desc);

alter table public.strength_session_override_log enable row level security;
revoke all on public.strength_session_override_log from anon, authenticated;
grant all on public.strength_session_override_log to service_role;

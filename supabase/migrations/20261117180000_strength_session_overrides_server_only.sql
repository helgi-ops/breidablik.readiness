-- Coach's daily exercise swaps on the strength card (fix 2026-11-17).
--
-- 20260511220000_strength_session_overrides.sql was never applied to production: the table did not exist, so every
-- swap a coach made on the strength card failed silently (the route's insert errored, the card swallowed it, and the
-- loaders' try/catch returned no swaps). This creates it, server-only:
--   - every read and write goes through server routes with the service role (strength-override route, the strength
--     loaders, the send routes); no browser code reads it;
--   - RLS on with NO policies for anon / authenticated (the May policies were broad: any profile role 'staff', and
--     auth.uid() without the (select …) InitPlan form). Replaying from scratch drops them again here.
--
-- Same columns, key and indexes as the May migration. Swaps are per player per day; a send applies a swap only while
-- the swapped-out exercise (original_exercise_id) is still in that slot.

create table if not exists public.strength_session_overrides (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  override_date date not null,
  block_id text not null,
  position int not null check (position >= 0),
  original_exercise_id text not null,
  override_exercise_id text not null,
  coach_id uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, override_date, block_id, position)
);

create index if not exists strength_session_overrides_player_date_idx
  on public.strength_session_overrides (player_id, override_date desc);
create index if not exists strength_session_overrides_team_date_idx
  on public.strength_session_overrides (team_id, override_date desc);
create index if not exists fki_strength_session_overrides_coach_id
  on public.strength_session_overrides (coach_id);

alter table public.strength_session_overrides enable row level security;

drop policy if exists "coaches_select_their_team_overrides" on public.strength_session_overrides;
drop policy if exists "coaches_insert_their_team_overrides" on public.strength_session_overrides;
drop policy if exists "coaches_update_their_team_overrides" on public.strength_session_overrides;
drop policy if exists "coaches_delete_their_team_overrides" on public.strength_session_overrides;
drop policy if exists "players_select_own_overrides" on public.strength_session_overrides;

revoke all on public.strength_session_overrides from anon, authenticated;
grant select, insert, update, delete on public.strength_session_overrides to service_role;

comment on table public.strength_session_overrides is
  'Coach manual swaps on the strength card, per player per day, applied AFTER the strength engine (preview and every send). Server-only (service role).';

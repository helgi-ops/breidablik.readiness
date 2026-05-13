-- Strength session coach overrides
--
-- Per-day overrides where the coach has manually swapped an exercise in
-- the engine-prescribed session. Applied AFTER the adaptation engine so
-- the coach has the final word.
--
-- Keyed on (player_id, override_date, block_id, position) so each slot
-- in each block can carry at most one override per day. Coach can clear
-- an override by DELETE + re-running buildStrengthSession.

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

-- Explicit grants — required from Oct 30 2026 onward (Supabase Data API
-- policy change announced May 13, 2026). Existing tables grandfather in
-- but newly-created tables need explicit GRANT before PostgREST /
-- supabase-js can see them. Defensive even though this migration runs on
-- the existing Breiðablik project before the cutover.
-- Service role retains full access (server-side jobs need to insert
-- coach overrides during AI Refinement flow). Authenticated role gets
-- CRUD; RLS policies below scope to coach's team. anon role intentionally
-- excluded — overrides should never be public.
grant select, insert, update, delete on public.strength_session_overrides to authenticated;
grant select, insert, update, delete on public.strength_session_overrides to service_role;

-- RLS
alter table public.strength_session_overrides enable row level security;

-- Coaches see and manage their team's overrides
create policy "coaches_select_their_team_overrides"
  on public.strength_session_overrides
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('coach','admin','staff')
        and (
          p.team_id = strength_session_overrides.team_id
          or exists (
            select 1 from public.coach_teams ct
            where ct.coach_id = auth.uid()
              and ct.team_id = strength_session_overrides.team_id
          )
        )
    )
  );

create policy "coaches_insert_their_team_overrides"
  on public.strength_session_overrides
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('coach','admin','staff')
        and (
          p.team_id = strength_session_overrides.team_id
          or exists (
            select 1 from public.coach_teams ct
            where ct.coach_id = auth.uid()
              and ct.team_id = strength_session_overrides.team_id
          )
        )
    )
  );

create policy "coaches_update_their_team_overrides"
  on public.strength_session_overrides
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('coach','admin','staff')
        and (
          p.team_id = strength_session_overrides.team_id
          or exists (
            select 1 from public.coach_teams ct
            where ct.coach_id = auth.uid()
              and ct.team_id = strength_session_overrides.team_id
          )
        )
    )
  );

create policy "coaches_delete_their_team_overrides"
  on public.strength_session_overrides
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('coach','admin','staff')
        and (
          p.team_id = strength_session_overrides.team_id
          or exists (
            select 1 from public.coach_teams ct
            where ct.coach_id = auth.uid()
              and ct.team_id = strength_session_overrides.team_id
          )
        )
    )
  );

-- Players can SELECT their own overrides (so they can see swap in app)
create policy "players_select_own_overrides"
  on public.strength_session_overrides
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.player_id = strength_session_overrides.player_id
    )
  );

comment on table public.strength_session_overrides is
  'Coach manual swaps applied AFTER the strength adaptation engine. One row per (player, date, block, position).';

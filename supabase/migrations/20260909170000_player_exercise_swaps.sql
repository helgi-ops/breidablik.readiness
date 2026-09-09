-- Player-initiated exercise swaps on the Today session card. The player may swap a
-- prescribed exercise for one of its CURATED SAFE ALTERNATIVES (Exercise.alternatives)
-- when the sent exercise isn't quite right for them (equipment, comfort, a niggle).
-- This is the audit log AND the coach's window into what players changed — one row
-- per (player, date, block, position); a re-swap of the same slot overwrites it, and
-- the current pick is (to_exercise_id, to_name). The Today card also reflects the swap
-- in player_today_strength_override.structure, but a coach re-send overwrites that
-- structure, so THIS table is the durable record of the player's intent.
create table if not exists player_exercise_swaps (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  entry_date date not null,
  block text not null,
  position int not null check (position >= 0),
  from_exercise_id text not null,
  to_exercise_id text not null,
  from_name text,
  to_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, entry_date, block, position)
);

create index if not exists player_exercise_swaps_team_date_idx
  on player_exercise_swaps (team_id, entry_date);

alter table player_exercise_swaps enable row level security;

-- Player owns their own rows (read + write). Auth user → player via players.user_id.
drop policy if exists player_exercise_swaps_owner on player_exercise_swaps;
create policy player_exercise_swaps_owner on player_exercise_swaps for all
  using (player_id in (select id from players where user_id = auth.uid()))
  with check (player_id in (select id from players where user_id = auth.uid()));

-- Coach / staff can READ their team's swaps (to see what players changed).
drop policy if exists player_exercise_swaps_coach_read on player_exercise_swaps;
create policy player_exercise_swaps_coach_read on player_exercise_swaps for select
  using (team_id in (select coach_team_ids()) or is_staff());

grant select, insert, update, delete on player_exercise_swaps to authenticated;
grant all on player_exercise_swaps to service_role;

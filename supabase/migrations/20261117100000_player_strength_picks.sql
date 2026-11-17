-- Player exercise picks, lota 1 (2026-11-17): a player chooses which of the team's exercises (the team strength
-- palette) they want in their own strength session. Their picks go first in that group when the engine builds
-- Today's session; dose, injury-prevention block and safety rules are unchanged. See
-- src/lib/micropulse/strengthProgramming/playerPicks.ts.
--
-- No coach approval: a pick applies from the next session sent. The coach sees every pick, can change it or lock a
-- group (with a reason, kept in the events), and turns the feature on per team (`player_picks_enabled`, off by
-- default). Never touches the readiness colour; not a Today source (the engine reads it while building the session
-- that the existing writers send — no new writer to player_today_strength_override).
--
-- Access: every write goes through the server (service role) after its own team checks. The browser may only READ:
-- coaches of the team, admins, and the player the picks belong to (can_read_goal_plan, 20261113170000).

-- ─── 1. Team switch ───────────────────────────────────────────────────────
alter table public.team_strength_palette
  add column if not exists player_picks_enabled boolean not null default false;

-- ─── 2. Tables ────────────────────────────────────────────────────────────
create table if not exists public.player_strength_picks (
  player_id uuid primary key references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  -- group → exercise ids, first choice first: {"power_explosive": ["ex_box_jump", "ex_db_snatch"], …}
  picks jsonb not null default '{}'::jsonb,
  -- Groups the coach chose for the player (the player can't change them).
  locked_slots text[] not null default '{}'::text[],
  updated_by uuid,
  updated_by_role text check (updated_by_role is null or updated_by_role in ('player', 'coach')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists player_strength_picks_team_idx on public.player_strength_picks (team_id);

-- Audit trail: every pick, coach change, lock and switch, with who and why.
create table if not exists public.player_strength_pick_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  -- Null for team-level events (the switch).
  player_id uuid references public.players(id) on delete cascade,
  kind text not null check (kind in ('picked', 'coach_set', 'locked', 'unlocked', 'enabled', 'disabled')),
  slot text,
  before jsonb,
  after jsonb,
  actor_user_id uuid,
  actor_role text not null check (actor_role in ('player', 'coach')),
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists player_strength_pick_events_team_idx on public.player_strength_pick_events (team_id, created_at desc);
create index if not exists player_strength_pick_events_player_idx on public.player_strength_pick_events (player_id, created_at desc);

-- ─── 3. Grants: read-only for logged-in users, writes only from the server ──
revoke all on public.player_strength_picks from public, anon, authenticated;
revoke all on public.player_strength_pick_events from public, anon, authenticated;
grant select on public.player_strength_picks to authenticated;
grant select on public.player_strength_pick_events to authenticated;
grant select, insert, update, delete on public.player_strength_picks to service_role;
grant select, insert, update, delete on public.player_strength_pick_events to service_role;

-- ─── 4. RLS ───────────────────────────────────────────────────────────────
alter table public.player_strength_picks enable row level security;
alter table public.player_strength_pick_events enable row level security;

drop policy if exists player_strength_picks_read on public.player_strength_picks;
create policy player_strength_picks_read on public.player_strength_picks
  for select to authenticated
  using (public.can_read_goal_plan(team_id, player_id));

drop policy if exists player_strength_pick_events_read on public.player_strength_pick_events;
create policy player_strength_pick_events_read on public.player_strength_pick_events
  for select to authenticated
  using (public.can_read_goal_plan(team_id, player_id));

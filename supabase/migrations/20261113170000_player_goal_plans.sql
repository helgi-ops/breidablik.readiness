-- Player goal plans, lota 2: a player asks for an 8-week add-on plan for one quality (top speed, acceleration,
-- braking, vertical jump); the coach approves, changes the start (with a logged reason) or declines.
-- See docs/goal-plan.md.
--
-- The plan is frozen at approval (`plan` jsonb), so a later change to the method library never changes a plan the
-- coach approved. The plan never reads or writes the readiness colour and is not a Today source
-- (it never touches player_today_strength_override).
--
-- Access: every write goes through the server (service role) after its own team checks. The browser may only READ:
-- coaches of the team, admins, and the player the plan belongs to. No staff_users shortcut (that table has held
-- player logins before).

-- ─── 1. Tables ─────────────────────────────────────────────────────────────
create table if not exists public.player_goal_plans (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  quality text not null check (quality in ('top_speed', 'acceleration', 'braking', 'jump')),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'declined', 'cancelled', 'paused', 'completed')),
  player_note text check (player_note is null or char_length(player_note) <= 280),
  -- What the rules suggested when the player asked (audit: "what did the system propose?").
  proposal jsonb,
  -- The plan the coach approved, frozen.
  plan jsonb,
  engine_version text,
  content_version text,
  -- Branch key the coach chose instead of the rule's start (null = the rule's start).
  start_override text,
  start_date date,
  end_date date,
  coach_note text check (coach_note is null or char_length(coach_note) <= 500),
  -- Why the coach declined, stopped or changed the plan.
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 500),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open goal per player at a time (a second request gets 409).
create unique index if not exists player_goal_plans_one_open_uq
  on public.player_goal_plans (player_id)
  where status in ('requested', 'approved', 'paused');
create index if not exists player_goal_plans_team_status_idx on public.player_goal_plans (team_id, status);
create index if not exists player_goal_plans_player_idx on public.player_goal_plans (player_id, created_at desc);

-- Audit trail: every request, decision, change and stop, with who and why.
create table if not exists public.player_goal_plan_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.player_goal_plans(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  kind text not null check (kind in (
    'requested', 'cancelled', 'approved', 'declined', 'start_changed', 'stopped', 'paused', 'resumed', 'completed'
  )),
  actor_user_id uuid,
  actor_role text not null check (actor_role in ('player', 'coach', 'system')),
  reason text check (reason is null or char_length(reason) <= 500),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists player_goal_plan_events_plan_idx on public.player_goal_plan_events (plan_id, created_at);
create index if not exists player_goal_plan_events_team_idx on public.player_goal_plan_events (team_id, created_at desc);

-- ─── 2. Who may read ──────────────────────────────────────────────────────
create or replace function public.can_read_goal_plan(p_team uuid, p_player uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select p_team is not null and (
    exists (
      select 1 from profiles
      where id = auth.uid()
        and (is_admin or (team_id = p_team and upper(coalesce(role, '')) in ('COACH', 'ADMIN', 'STAFF')))
    )
    or exists (select 1 from coach_teams where coach_id = auth.uid() and team_id = p_team)
    or exists (select 1 from players where id = p_player and user_id = auth.uid())
  )
$fn$;
revoke all on function public.can_read_goal_plan(uuid, uuid) from public, anon;
grant execute on function public.can_read_goal_plan(uuid, uuid) to authenticated, service_role;

-- ─── 3. Grants: read-only for logged-in users, writes only from the server ──
revoke all on public.player_goal_plans from public, anon, authenticated;
revoke all on public.player_goal_plan_events from public, anon, authenticated;
grant select on public.player_goal_plans to authenticated;
grant select on public.player_goal_plan_events to authenticated;
grant select, insert, update, delete on public.player_goal_plans to service_role;
grant select, insert, update, delete on public.player_goal_plan_events to service_role;

-- ─── 4. RLS ───────────────────────────────────────────────────────────────
alter table public.player_goal_plans enable row level security;
alter table public.player_goal_plan_events enable row level security;

drop policy if exists player_goal_plans_read on public.player_goal_plans;
create policy player_goal_plans_read on public.player_goal_plans
  for select to authenticated
  using (public.can_read_goal_plan(team_id, player_id));

drop policy if exists player_goal_plan_events_read on public.player_goal_plan_events;
create policy player_goal_plan_events_read on public.player_goal_plan_events
  for select to authenticated
  using (public.can_read_goal_plan(team_id, player_id));

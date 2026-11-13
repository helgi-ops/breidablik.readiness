-- Player goal plans, lota 4: progress and outcome.
--   1. player_goal_plan_sessions — the player's "done" / "couldn't do it" tick on a placed session (adherence).
--      One row per plan, plan week and session slot. The server only accepts a tick for a session the rules placed
--      this week on today or an earlier day.
--   2. player_goal_plan_results — test results the coach enters (week-1 starting point and week-8 retest): flying 20 m,
--      top speed, 10 m, cut test, jump height. Jump height from VALD is read live and is not copied here.
--   3. Two more audit-trail kinds: result_added, result_removed.
-- See docs/goal-plan.md. Same access as lota 2: the browser may only READ (can_read_goal_plan); every write goes
-- through the server with the service role after its own team checks. Never touches the readiness colour or
-- Today's session.

-- ─── 1. Session ticks ──────────────────────────────────────────────────────
create table if not exists public.player_goal_plan_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.player_goal_plans(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  week smallint not null check (week between 1 and 8),
  slot text not null check (slot in ('A', 'B', 'C')),
  session_date date not null,
  status text not null check (status in ('done', 'skipped')),
  -- The version shown that day (full / lighter / skip), from the check-in colour. Informational.
  version text check (version is null or version in ('full', 'lighter', 'skip')),
  marked_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, week, slot)
);
create index if not exists player_goal_plan_sessions_plan_idx on public.player_goal_plan_sessions (plan_id, week);

-- ─── 2. Test results ───────────────────────────────────────────────────────
create table if not exists public.player_goal_plan_results (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.player_goal_plans(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  measure text not null check (measure in ('flying_20m_s', 'top_speed_kmh', 'sprint_10m_s', 'cut_test_s', 'cmj_cm')),
  phase text not null check (phase in ('baseline', 'retest')),
  value numeric not null check (value > 0 and value < 1000),
  test_date date not null,
  note text check (note is null or char_length(note) <= 280),
  entered_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists player_goal_plan_results_plan_idx on public.player_goal_plan_results (plan_id, measure, test_date);

-- ─── 3. Audit-trail kinds ──────────────────────────────────────────────────
alter table public.player_goal_plan_events drop constraint if exists player_goal_plan_events_kind_check;
alter table public.player_goal_plan_events add constraint player_goal_plan_events_kind_check check (kind in (
  'requested', 'cancelled', 'approved', 'declined', 'start_changed', 'stopped', 'paused', 'resumed', 'completed',
  'result_added', 'result_removed'
));

-- ─── 4. Grants: read-only for logged-in users, writes only from the server ──
revoke all on public.player_goal_plan_sessions from public, anon, authenticated;
revoke all on public.player_goal_plan_results from public, anon, authenticated;
grant select on public.player_goal_plan_sessions to authenticated;
grant select on public.player_goal_plan_results to authenticated;
grant select, insert, update, delete on public.player_goal_plan_sessions to service_role;
grant select, insert, update, delete on public.player_goal_plan_results to service_role;

-- ─── 5. RLS ───────────────────────────────────────────────────────────────
alter table public.player_goal_plan_sessions enable row level security;
alter table public.player_goal_plan_results enable row level security;

drop policy if exists player_goal_plan_sessions_read on public.player_goal_plan_sessions;
create policy player_goal_plan_sessions_read on public.player_goal_plan_sessions
  for select to authenticated
  using (public.can_read_goal_plan(team_id, player_id));

drop policy if exists player_goal_plan_results_read on public.player_goal_plan_results;
create policy player_goal_plan_results_read on public.player_goal_plan_results
  for select to authenticated
  using (public.can_read_goal_plan(team_id, player_id));

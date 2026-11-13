-- Player goal plans, lota 3: the plan pauses on its own when the player is marked injured / in rehab / in
-- return-to-train, and only the coach restarts it. These two columns record when it paused and which plan week the
-- player was in, so the coach can pick it up at that week (or from week 1 after a long break).
-- See docs/goal-plan.md. Access and grants are unchanged (writes are server-only).

alter table public.player_goal_plans
  add column if not exists paused_at timestamptz,
  add column if not exists paused_week smallint check (paused_week is null or paused_week between 0 and 8);

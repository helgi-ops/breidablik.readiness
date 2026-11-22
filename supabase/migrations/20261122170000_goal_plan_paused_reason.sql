-- Goal plans pause in season (2026-11-22, rule GOAL_PLAN_PAUSED_IN_SEASON).
--
-- paused_reason: why a paused plan is paused. 'injury' = marked injured / rehab / return-to-train (only the coach
-- restarts it); 'in_season' = the competitive season started (it resumes on its own at the next pre-season, or the
-- coach resumes it early with a logged reason). Existing paused rows keep null, which the app reads as 'injury'.
--
-- season_override_at: the coach resumed the plan while in season (a logged override, coach decides last); the
-- automatic in-season pause then leaves this plan alone.

alter table public.player_goal_plans
  add column if not exists paused_reason text,
  add column if not exists season_override_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'player_goal_plans_paused_reason_check'
  ) then
    alter table public.player_goal_plans
      add constraint player_goal_plans_paused_reason_check
      check (paused_reason is null or paused_reason in ('injury', 'in_season'));
  end if;
end $$;

comment on column public.player_goal_plans.paused_reason is
  'Why the plan is paused: injury (coach restarts) or in_season (resumes at the next pre-season). Null on old rows = injury.';
comment on column public.player_goal_plans.season_override_at is
  'The coach resumed the plan in season (logged override); the automatic in-season pause skips it.';

-- Goal plans start without the coach's approval, lota 3 of player choices (2026-11-17).
--
-- When player choices are on for a player (team switch `team_strength_palette.player_picks_enabled`, or the coach's
-- one-player test `player_strength_picks.test_enabled`), a player's goal (top speed / acceleration / braking / jump)
-- starts right away: the plan is built and frozen by the same rules and safety checks as an approval (rule start,
-- the team's level and swaps; injured / returning players still blocked; under 18 youth plans), starting the next
-- Monday. The coach sees it on /coach/goal-requests and can stop it (with a reason). The player may withdraw it
-- until it starts.
--
-- auto_started marks those plans (coach badge, player's withdraw-before-start). Events reuse the existing kinds:
-- requested (player, detail.auto_start) + approved (actor_role = 'system', detail.auto = true).
--
-- Never touches the readiness colour or any Today source; writes only from the server (goalPlan/store.ts).

alter table public.player_goal_plans
  add column if not exists auto_started boolean not null default false;

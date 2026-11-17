-- Player strength goal + one-player test, lota 2 (2026-11-17). Builds on 20261117100000_player_strength_picks.sql.
--
-- 1. strength_goal: the player picks ONE goal (stronger / power / robust). On the goal's days the matching
--    exercise in Today's session gets one more set, unless readiness, a two-match week or a safety rule says no
--    (src/lib/micropulse/strengthProgramming/playerGoal.ts). No coach approval; the coach sees it, can change it
--    or lock it (goal_locked), with a reason kept in the events.
-- 2. test_enabled: the coach can turn picks + goal on for ONE player (e.g. a test player) while the team switch
--    stays off. The player's app then shows "My exercises" and the engine reads that player's choices.
--
-- Never touches the readiness colour; not a Today source; no new writer to player_today_strength_override.
-- Writes only from the server (service role); read access unchanged (can_read_goal_plan).

alter table public.player_strength_picks
  add column if not exists strength_goal text,
  add column if not exists goal_locked boolean not null default false,
  add column if not exists test_enabled boolean not null default false;

alter table public.player_strength_picks drop constraint if exists player_strength_picks_strength_goal_check;
alter table public.player_strength_picks
  add constraint player_strength_picks_strength_goal_check
  check (strength_goal is null or strength_goal in ('stronger', 'power', 'robust'));

-- New event kinds: goal set / locked / unlocked, test on / off.
alter table public.player_strength_pick_events drop constraint if exists player_strength_pick_events_kind_check;
alter table public.player_strength_pick_events
  add constraint player_strength_pick_events_kind_check
  check (kind in ('picked', 'coach_set', 'locked', 'unlocked', 'enabled', 'disabled',
                  'goal_set', 'goal_locked', 'goal_unlocked', 'test_on', 'test_off'));

-- Coaches look up the test players of a team.
create index if not exists player_strength_picks_test_idx
  on public.player_strength_picks (team_id) where test_enabled;

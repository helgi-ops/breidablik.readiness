-- Three strength send modes (2026-11-17). Builds on 20260909140000_team_strength_send_mode.sql and
-- 20261117140000_player_strength_goal_and_test.sql.
--
--   'standard'              — the team's Custom Programme (what the coach authored; any length).
--   'individualised'        — data + screen: each player's own session. Players choose nothing.
--   'individualised_goals'  — data + screen + goals: as above, and the players take part (exercise picks, a strength
--                             goal, 8-week goals without approval, the goal's gym session in Today's session).
--
-- The team's mode (teams.strength_send_mode) is now the ONE switch for player choices; the old team switch
-- (team_strength_palette.player_picks_enabled) is no longer read and stays as it is (off for every team).
--
-- Per player (player_strength_picks):
--   test_enabled  — the coach turned choices on for this player while the team is on another mode (unchanged).
--   choices_off   — new: the coach took this player out while the team is on 'individualised_goals'.
--
-- No data changes: no team is moved to the new mode. Never touches the readiness colour; not a Today source.

alter table public.teams drop constraint if exists teams_strength_send_mode_check;
alter table public.teams
  add constraint teams_strength_send_mode_check
  check (strength_send_mode in ('individualised', 'standard', 'individualised_goals'));

alter table public.player_strength_picks
  add column if not exists choices_off boolean not null default false;

-- New event kinds: a player taken out / back in, and the team's mode changing to or from the goals mode.
alter table public.player_strength_pick_events drop constraint if exists player_strength_pick_events_kind_check;
alter table public.player_strength_pick_events
  add constraint player_strength_pick_events_kind_check
  check (kind in ('picked', 'coach_set', 'locked', 'unlocked', 'enabled', 'disabled',
                  'goal_set', 'goal_locked', 'goal_unlocked', 'test_on', 'test_off',
                  'player_out', 'player_in'));

-- Widen sb_team_match_stats for the Single-Match "Team match stats" readable report.
--
-- Two groups:
--   (a) metrics the StatsBomb per-player "Match Stats" export provides once summed to the team
--       (through balls, line breaks, key passes, tackles, aerials, dribbles, final-third passes…);
--   (b) metrics that only the StatsBomb TEAM-level "Match Stats" summary carries (PPDA, directness,
--       possession %, shots on target, progressive passes, defensive-action regains, long balls,
--       clear shots, counter-attacking shots) — added now (nullable) so the report structure is
--       complete and honestly shows "—" until that file is uploaded.
--
-- All nullable numeric; no backfill. Descriptive football context — never touches readiness.

alter table public.sb_team_match_stats
  -- (a) from the per-player Match Stats file (team-summed)
  add column if not exists passes_final_third        numeric,
  add column if not exists through_balls             numeric,
  add column if not exists line_breaks               numeric,
  add column if not exists key_passes                numeric,
  add column if not exists assists                   numeric,
  add column if not exists xg_assist                 numeric,
  add column if not exists tackles                   numeric,
  add column if not exists interceptions             numeric,
  add column if not exists fouls                     numeric,
  add column if not exists clearances                numeric,
  add column if not exists aerials_won               numeric,
  add column if not exists aerials_total             numeric,
  add column if not exists dribbles                  numeric,
  add column if not exists dispossessed              numeric,
  add column if not exists cross_pct                 numeric,
  -- (b) from the TEAM-level Match Stats summary (nullable placeholders)
  add column if not exists shots_on_target           numeric,
  add column if not exists shots_on_target_against   numeric,
  add column if not exists possession_pct            numeric,
  add column if not exists progressive_passes        numeric,
  add column if not exists ppda                      numeric,
  add column if not exists directness                numeric,
  add column if not exists def_action_regains        numeric,
  add column if not exists long_ball_pressured       numeric,
  add column if not exists long_ball_unpressured     numeric,
  add column if not exists clear_shots               numeric,
  add column if not exists clear_shots_against       numeric,
  add column if not exists counter_shots             numeric,
  add column if not exists counter_shots_against     numeric;

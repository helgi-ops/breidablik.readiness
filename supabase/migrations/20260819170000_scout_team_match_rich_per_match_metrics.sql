-- Persist the RICH per-match metrics on scout_team_match (they were computed by
-- buildTeamMatchStatRows from the Wyscout Team -> Stats export, then discarded — only
-- goals/xG/result were kept). Storing them lets the 5/10/all recent-form window average
-- real per-match data (possession, PPDA, shots, crosses, duels, passes) instead of xG only.
-- Descriptive scouting context — never touches readiness. Backfilled on the next re-import.
ALTER TABLE scout_team_match
  ADD COLUMN IF NOT EXISTS shots                        numeric,
  ADD COLUMN IF NOT EXISTS shots_against                numeric,
  ADD COLUMN IF NOT EXISTS possession_pct               numeric,
  ADD COLUMN IF NOT EXISTS ppda                         numeric,
  ADD COLUMN IF NOT EXISTS def_duels_won_pct            numeric,
  ADD COLUMN IF NOT EXISTS forward_passes               numeric,
  ADD COLUMN IF NOT EXISTS forward_pass_acc_pct         numeric,
  ADD COLUMN IF NOT EXISTS passes_final_third           numeric,
  ADD COLUMN IF NOT EXISTS passes_final_third_acc_pct   numeric,
  ADD COLUMN IF NOT EXISTS progressive_passes           numeric,
  ADD COLUMN IF NOT EXISTS smart_passes                 numeric,
  ADD COLUMN IF NOT EXISTS smart_pass_acc_pct           numeric,
  ADD COLUMN IF NOT EXISTS crosses                      numeric,
  ADD COLUMN IF NOT EXISTS cross_acc_pct                numeric,
  ADD COLUMN IF NOT EXISTS positional_attacks           numeric,
  ADD COLUMN IF NOT EXISTS counterattacks               numeric,
  ADD COLUMN IF NOT EXISTS offensive_duels_won_pct      numeric;

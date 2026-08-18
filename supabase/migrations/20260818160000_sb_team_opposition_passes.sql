-- opposition_passes — the opponent's total passes for the game (from the StatsBomb team-level file's
-- "Opposition Passes" column). Not a wishlist metric itself, but the denominator/numerator the two
-- ESTIMATED reads need: Possession % ≈ own ÷ (own + opp) passes, and PPDA ≈ opp passes ÷ (tackles +
-- interceptions + fouls). Both are surfaced as labelled estimates (StatsBomb ships no true
-- possession % or PPDA column). Nullable numeric; no backfill. Descriptive — never touches readiness.

alter table public.sb_team_match_stats
  add column if not exists opposition_passes numeric;

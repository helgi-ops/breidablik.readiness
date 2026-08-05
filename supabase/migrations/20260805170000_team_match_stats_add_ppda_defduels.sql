-- Adds pressing (PPDA) and defensive-duel columns to team_match_stats so the
-- Match Insights "Wins vs losses — match stats" panel can compare them.
-- Sourced from the Wyscout Team → Stats "Indexes" and "Defending" exports;
-- stored on the own (is_opponent=false) row. Descriptive context only — never
-- feeds the readiness colour. Applied via mcp apply_migration; committed here per
-- the repo rule that every applied migration is reproducible.

alter table public.team_match_stats
  add column if not exists ppda numeric,
  add column if not exists def_duels_won_pct numeric;

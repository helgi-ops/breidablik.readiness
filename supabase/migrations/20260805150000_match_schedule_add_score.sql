-- Match result entry (Match Insights). Nullable score columns on the canonical
-- fixtures table every surface already joins on. W/D/L is derived in code from
-- these two, not stored, to avoid drift. Descriptive only — never a readiness signal.
ALTER TABLE match_schedule
  ADD COLUMN IF NOT EXISTS goals_for int,
  ADD COLUMN IF NOT EXISTS goals_against int;

-- Rich per-90 metric bag for opponent players, populated from the StatsBomb Squad
-- export (same file as own-squad player analysis). Powers the Opponent Scouting
-- "Players" tab (within-opponent-squad percentiles). Descriptive only; never touches
-- readiness. The thin Player Stats / Wyscout exports leave this NULL (honest empty state).
ALTER TABLE scout_player ADD COLUMN IF NOT EXISTS metrics jsonb;

-- Let a scouted opponent keep BOTH a Wyscout AND a StatsBomb season row (previously one
-- row per opponent+season, so one source overwrote the other). The opponent report merges
-- them at read time: StatsBomb leads, Wyscout fills the gaps StatsBomb Team Stats lacks,
-- each metric labelled by source. Providers are still never mixed in a benchmark — each
-- metric is judged against ITS OWN source's league average. Descriptive — never readiness.
UPDATE scout_team_season SET source = 'wyscout' WHERE source IS NULL;
ALTER TABLE scout_team_season ALTER COLUMN source SET DEFAULT 'wyscout';
ALTER TABLE scout_team_season DROP CONSTRAINT IF EXISTS scout_team_season_owner_team_id_opponent_name_season_key;
ALTER TABLE scout_team_season ADD CONSTRAINT scout_team_season_owner_opp_season_source_key
  UNIQUE (owner_team_id, opponent_name, season, source);

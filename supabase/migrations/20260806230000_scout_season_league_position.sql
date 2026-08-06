-- Opponent league standing on the scouted-season row (optional; sourced manually / from KSÍ).
-- Descriptive context only — never touches the readiness colour or the daily decision.
alter table scout_team_season add column if not exists league_position int;
comment on column scout_team_season.league_position is 'Opponent league standing (optional; manual/KSÍ). Descriptive only.';

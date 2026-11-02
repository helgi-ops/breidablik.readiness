-- Per-client override for the daily wellness check-in (readiness/RPE).
-- NULL = inherit the team setting (team_settings.uses_wellness_features, which
-- for a personal_trainer practice defaults to OFF). true = check-in ON for this
-- client; false = OFF. Resolution order: player flag -> team flag -> team_type
-- default. See src/lib/teamMode.ts resolveWellnessForPlayer / getGpsOnlyPlayerIds.
alter table public.players
  add column if not exists uses_wellness_features boolean;

comment on column public.players.uses_wellness_features is
  'Per-client override for the daily wellness check-in (readiness/RPE). NULL = inherit the team setting (team_settings.uses_wellness_features, which for a personal_trainer practice defaults to OFF). true = check-in ON for this client; false = OFF. Resolution order: player flag -> team flag -> team_type default. See src/lib/teamMode.ts resolveWellnessForPlayer / getGpsOnlyPlayerIds.';

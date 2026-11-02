-- team_settings.uses_wellness_features: make nullable so NULL means
-- "the practice has not chosen yet" and the effective default can depend on
-- team_type. A personal-trainer practice defaults to check-in OFF (clients just
-- track load/strength); a club team keeps defaulting to ON (Full Suite). The
-- resolution lives in src/lib/teamMode.ts (getTeamMode / getGpsOnlyTeamIds) and
-- src/lib/useTeamMode.ts — an explicit true/false always wins; NULL falls back
-- to the team_type default.
--
-- Previously the column was NOT NULL DEFAULT true, so every team (and every
-- settings-row insert that omitted the flag) silently became Full Suite. Dropping
-- the default lets a PT practice stay OFF even after it touches other settings,
-- and keeps club teams unchanged (NULL still resolves to ON for them).
alter table public.team_settings
  alter column uses_wellness_features drop not null,
  alter column uses_wellness_features drop default;

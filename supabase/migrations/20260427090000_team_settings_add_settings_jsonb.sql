-- Add the JSONB settings column that /api/team/schedule/sync-sheet
-- already reads from. Without it, the sync-sheet endpoint silently
-- falls back to a hardcoded Breiðablik config — every other team
-- gets "no sheet configured" + cannot sync.
--
-- Schema for the JSONB:
--   {
--     "schedule_sheet_id": "1ag3rCwMO8JE...",
--     "schedule_month_gids": { "2026-04": "530492931", ... }
--   }
--
-- Per-month GIDs are optional — sync-sheet falls back to the first
-- sheet if month_gids is empty.

alter table public.team_settings
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.team_settings.settings is
'Per-team feature settings. Currently used by /api/team/schedule/sync-sheet which reads schedule_sheet_id and schedule_month_gids. Free-form JSONB so we can add new feature flags without a migration each time.';

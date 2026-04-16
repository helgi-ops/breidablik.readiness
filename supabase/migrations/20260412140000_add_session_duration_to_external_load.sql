-- Store the session duration (in minutes) from Catapult/GPS so it can be used
-- to auto-fill the RPE form duration field for players.
ALTER TABLE public.player_external_load_daily
  ADD COLUMN IF NOT EXISTS session_duration_minutes numeric;

COMMENT ON COLUMN public.player_external_load_daily.session_duration_minutes IS
  'Total session duration in minutes from Catapult GPS data. Used to auto-fill RPE form duration.';

-- The Catapult Cloud Activity Report CSV exposes a few additional columns
-- the API integration didn't surface. Adding nullable columns so the bulk
-- CSV upload can persist them rather than dropping them on the floor:
--
--   max_acceleration       Peak acceleration in m/s² (Catapult "Max Acceleration")
--   max_deceleration       Peak deceleration in m/s² (Catapult "Max Deceleration") — stored as positive magnitude
--   accel_decel_efforts    Combined accel+decel effort count ("Accel&Decel Efforts")
--   md_day_label           OpenField "MD Day" tag (e.g. "MD-3", "MD+1") — preserved as text for context only
--
-- All nullable, no defaults. McBurnie/Decel Intelligence engines do not depend
-- on these fields yet — they're additive context for now.

ALTER TABLE public.player_external_load_daily
  ADD COLUMN IF NOT EXISTS max_acceleration    numeric(6,2) NULL,
  ADD COLUMN IF NOT EXISTS max_deceleration    numeric(6,2) NULL,
  ADD COLUMN IF NOT EXISTS accel_decel_efforts integer       NULL,
  ADD COLUMN IF NOT EXISTS md_day_label        text          NULL;

COMMENT ON COLUMN public.player_external_load_daily.max_acceleration    IS 'Peak acceleration in m/s² (Catapult Activity Report CSV "Max Acceleration").';
COMMENT ON COLUMN public.player_external_load_daily.max_deceleration    IS 'Peak deceleration magnitude in m/s² (Catapult Activity Report CSV "Max Deceleration"). Stored as positive value.';
COMMENT ON COLUMN public.player_external_load_daily.accel_decel_efforts IS 'Combined accel+decel effort count (Catapult "Accel&Decel Efforts").';
COMMENT ON COLUMN public.player_external_load_daily.md_day_label        IS 'OpenField MD Day tag (e.g. MD-3, MD+1). Context only — not used in pipeline math yet.';

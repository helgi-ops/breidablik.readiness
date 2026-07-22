-- Catapult HR: extend to the real 8-band model + min HR + %HRmax/%HRavg (HRex).
-- OpenField sends heart_rate_band1..8_total_duration (8 bands) but the table only
-- had 5 zone columns; collapsing 8→5 would fabricate zone boundaries, so we extend.
-- Also surfaces the submaximal-HR signal (percentage_max/avg_heart_rate) that was
-- arriving unmapped. All durations are Catapult seconds (stored as-is, like every
-- other *_duration field). Missing → NULL, never 0.
ALTER TABLE public.player_external_load_daily
  ADD COLUMN IF NOT EXISTS min_heart_rate numeric,
  ADD COLUMN IF NOT EXISTS hr_zone_6_time_s numeric,
  ADD COLUMN IF NOT EXISTS hr_zone_7_time_s numeric,
  ADD COLUMN IF NOT EXISTS hr_zone_8_time_s numeric,
  ADD COLUMN IF NOT EXISTS pct_max_heart_rate numeric,
  ADD COLUMN IF NOT EXISTS pct_avg_heart_rate numeric;

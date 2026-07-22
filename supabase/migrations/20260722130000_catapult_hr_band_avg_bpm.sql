-- Catapult HR: per-band average bpm, so the 8 time-in-band durations can be
-- LABELLED as real HR ranges ("Band 8 ≈ 185 bpm") instead of bare ordinals.
-- Source: heart_rate_bandN_average_beats_per_minute (already in the payload).
-- Display label only; missing → NULL, never 0.
ALTER TABLE public.player_external_load_daily
  ADD COLUMN IF NOT EXISTS hr_zone_1_avg_bpm numeric,
  ADD COLUMN IF NOT EXISTS hr_zone_2_avg_bpm numeric,
  ADD COLUMN IF NOT EXISTS hr_zone_3_avg_bpm numeric,
  ADD COLUMN IF NOT EXISTS hr_zone_4_avg_bpm numeric,
  ADD COLUMN IF NOT EXISTS hr_zone_5_avg_bpm numeric,
  ADD COLUMN IF NOT EXISTS hr_zone_6_avg_bpm numeric,
  ADD COLUMN IF NOT EXISTS hr_zone_7_avg_bpm numeric,
  ADD COLUMN IF NOT EXISTS hr_zone_8_avg_bpm numeric;

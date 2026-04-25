-- IMA Free Running 8-band indoor stride pipeline
--
-- Catapult OpenField "IMA Free Running" parameters use IMU sensors only (no GPS),
-- so they work indoors. Each band represents a stride velocity range:
--   Band 1: <8 km/h equiv (walk/jog)
--   Band 2: 8-12 km/h
--   Band 3: 12-15 km/h
--   Band 4: 15-18 km/h
--   Band 5: 18-21 km/h (high intensity)
--   Band 6: 21-24 km/h (sprint-equivalent indoor)
--   Band 7: 24-27 km/h (only in 100m+ halls)
--   Band 8: >27 km/h (rare, only fastest athletes in long halls)
--
-- 3 metrics per band:
--   stride_count       — total stride volume (#)
--   avg_stride_rate    — cadence (Hz, strides/sec)
--   total_player_load  — IMU load contribution (a.u.)

alter table public.player_external_load_daily
  -- Band 1
  add column if not exists ima_fr_band1_stride_count integer,
  add column if not exists ima_fr_band1_avg_stride_rate numeric,
  add column if not exists ima_fr_band1_total_player_load numeric,
  -- Band 2
  add column if not exists ima_fr_band2_stride_count integer,
  add column if not exists ima_fr_band2_avg_stride_rate numeric,
  add column if not exists ima_fr_band2_total_player_load numeric,
  -- Band 3
  add column if not exists ima_fr_band3_stride_count integer,
  add column if not exists ima_fr_band3_avg_stride_rate numeric,
  add column if not exists ima_fr_band3_total_player_load numeric,
  -- Band 4
  add column if not exists ima_fr_band4_stride_count integer,
  add column if not exists ima_fr_band4_avg_stride_rate numeric,
  add column if not exists ima_fr_band4_total_player_load numeric,
  -- Band 5
  add column if not exists ima_fr_band5_stride_count integer,
  add column if not exists ima_fr_band5_avg_stride_rate numeric,
  add column if not exists ima_fr_band5_total_player_load numeric,
  -- Band 6
  add column if not exists ima_fr_band6_stride_count integer,
  add column if not exists ima_fr_band6_avg_stride_rate numeric,
  add column if not exists ima_fr_band6_total_player_load numeric,
  -- Band 7
  add column if not exists ima_fr_band7_stride_count integer,
  add column if not exists ima_fr_band7_avg_stride_rate numeric,
  add column if not exists ima_fr_band7_total_player_load numeric,
  -- Band 8
  add column if not exists ima_fr_band8_stride_count integer,
  add column if not exists ima_fr_band8_avg_stride_rate numeric,
  add column if not exists ima_fr_band8_total_player_load numeric;

-- Convenience view: total strides + indoor sprint count derived from bands
create or replace view public.player_indoor_stride_summary as
select
  player_id,
  date,
  source,
  -- Total stride volume across all 8 bands
  coalesce(ima_fr_band1_stride_count, 0) +
  coalesce(ima_fr_band2_stride_count, 0) +
  coalesce(ima_fr_band3_stride_count, 0) +
  coalesce(ima_fr_band4_stride_count, 0) +
  coalesce(ima_fr_band5_stride_count, 0) +
  coalesce(ima_fr_band6_stride_count, 0) +
  coalesce(ima_fr_band7_stride_count, 0) +
  coalesce(ima_fr_band8_stride_count, 0) as total_strides,
  -- Indoor sprint event count (Band 5+ ≥ 18 km/h equivalent stride velocity)
  coalesce(ima_fr_band5_stride_count, 0) +
  coalesce(ima_fr_band6_stride_count, 0) +
  coalesce(ima_fr_band7_stride_count, 0) +
  coalesce(ima_fr_band8_stride_count, 0) as indoor_sprint_strides,
  -- High-band IMU player load (proxy for indoor neuromuscular load)
  coalesce(ima_fr_band4_total_player_load, 0) +
  coalesce(ima_fr_band5_total_player_load, 0) +
  coalesce(ima_fr_band6_total_player_load, 0) +
  coalesce(ima_fr_band7_total_player_load, 0) +
  coalesce(ima_fr_band8_total_player_load, 0) as high_intensity_player_load,
  -- Cadence symmetry indicator: max - min stride rate across active bands
  -- (high asymmetry = neuromuscular fatigue / form breakdown)
  greatest(
    coalesce(ima_fr_band1_avg_stride_rate, 0),
    coalesce(ima_fr_band2_avg_stride_rate, 0),
    coalesce(ima_fr_band3_avg_stride_rate, 0),
    coalesce(ima_fr_band4_avg_stride_rate, 0),
    coalesce(ima_fr_band5_avg_stride_rate, 0),
    coalesce(ima_fr_band6_avg_stride_rate, 0)
  ) as max_stride_rate
from public.player_external_load_daily
where source = 'catapult';

comment on view public.player_indoor_stride_summary is
  'Aggregate stride metrics derived from IMA Free Running 8-band pipeline. '
  'Use total_strides for volume, indoor_sprint_strides for indoor sprint count proxy '
  '(McBurnie indoor adaptation), high_intensity_player_load for neuromuscular load.';

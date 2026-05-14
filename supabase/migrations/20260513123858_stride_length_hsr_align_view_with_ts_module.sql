-- ─────────────────────────────────────────────────────────────────────────
-- Align player_stride_summary.stride_length_hsr_m with the live TS module.
--
-- The view was using an early v1 formula:
--   velocity_band5_total_distance / (hi-cadence stride bands 5-8)
-- which produced values like 0.02–1.6 m/stride. The TS module (src/lib/
-- micropulse/strideIntelligence/index.ts) was upgraded to v3:
--   total_distance / total_strides
-- but the view was never updated, so:
--   • coach card showed v3 value for today (3+ m/stride)
--   • sparkline showed v1 values (~0.1 m/stride)
--   • refresh_stride_baselines() reads from the view → most rows failed the
--     `> 0.5` sanity floor and got filtered out, so the baseline row was
--     missing for almost every player and the rest-day card showed "—".
--
-- Fix: replace the column expression with the v3 formula so view, live
-- card, and baselines all agree. Other columns (cadence_weighted,
-- cod_lr_asym_pct, etc.) are unchanged.
-- ─────────────────────────────────────────────────────────────────────────

create or replace view public.player_stride_summary as
select
  player_id,
  date,
  source,
  coalesce(ima_fr_band1_stride_count, 0) + coalesce(ima_fr_band2_stride_count, 0) + coalesce(ima_fr_band3_stride_count, 0) + coalesce(ima_fr_band4_stride_count, 0) + coalesce(ima_fr_band5_stride_count, 0) + coalesce(ima_fr_band6_stride_count, 0) + coalesce(ima_fr_band7_stride_count, 0) + coalesce(ima_fr_band8_stride_count, 0) as total_strides,
  coalesce(ima_fr_band5_stride_count, 0) + coalesce(ima_fr_band6_stride_count, 0) + coalesce(ima_fr_band7_stride_count, 0) + coalesce(ima_fr_band8_stride_count, 0) as hi_velocity_strides,
  coalesce(ima_fr_band4_total_player_load, 0::numeric) + coalesce(ima_fr_band5_total_player_load, 0::numeric) + coalesce(ima_fr_band6_total_player_load, 0::numeric) + coalesce(ima_fr_band7_total_player_load, 0::numeric) + coalesce(ima_fr_band8_total_player_load, 0::numeric) as high_intensity_player_load,
  case
    when (coalesce(ima_fr_band1_stride_count, 0) + coalesce(ima_fr_band2_stride_count, 0) + coalesce(ima_fr_band3_stride_count, 0) + coalesce(ima_fr_band4_stride_count, 0) + coalesce(ima_fr_band5_stride_count, 0) + coalesce(ima_fr_band6_stride_count, 0) + coalesce(ima_fr_band7_stride_count, 0) + coalesce(ima_fr_band8_stride_count, 0)) > 0
    then (coalesce(ima_fr_band1_stride_count, 0)::numeric * coalesce(ima_fr_band1_avg_stride_rate, 0::numeric) + coalesce(ima_fr_band2_stride_count, 0)::numeric * coalesce(ima_fr_band2_avg_stride_rate, 0::numeric) + coalesce(ima_fr_band3_stride_count, 0)::numeric * coalesce(ima_fr_band3_avg_stride_rate, 0::numeric) + coalesce(ima_fr_band4_stride_count, 0)::numeric * coalesce(ima_fr_band4_avg_stride_rate, 0::numeric) + coalesce(ima_fr_band5_stride_count, 0)::numeric * coalesce(ima_fr_band5_avg_stride_rate, 0::numeric) + coalesce(ima_fr_band6_stride_count, 0)::numeric * coalesce(ima_fr_band6_avg_stride_rate, 0::numeric) + coalesce(ima_fr_band7_stride_count, 0)::numeric * coalesce(ima_fr_band7_avg_stride_rate, 0::numeric) + coalesce(ima_fr_band8_stride_count, 0)::numeric * coalesce(ima_fr_band8_avg_stride_rate, 0::numeric)) / nullif(coalesce(ima_fr_band1_stride_count, 0) + coalesce(ima_fr_band2_stride_count, 0) + coalesce(ima_fr_band3_stride_count, 0) + coalesce(ima_fr_band4_stride_count, 0) + coalesce(ima_fr_band5_stride_count, 0) + coalesce(ima_fr_band6_stride_count, 0) + coalesce(ima_fr_band7_stride_count, 0) + coalesce(ima_fr_band8_stride_count, 0), 0)::numeric
    else null::numeric
  end as cadence_weighted,
  coalesce(ima_cod_left_high, 0) + coalesce(ima_cod_left_medium, 0) + coalesce(ima_cod_left_low, 0) as cod_left_total,
  coalesce(ima_cod_right_high, 0) + coalesce(ima_cod_right_medium, 0) + coalesce(ima_cod_right_low, 0) as cod_right_total,
  case
    when (coalesce(ima_cod_left_high, 0) + coalesce(ima_cod_left_medium, 0) + coalesce(ima_cod_left_low, 0) + coalesce(ima_cod_right_high, 0) + coalesce(ima_cod_right_medium, 0) + coalesce(ima_cod_right_low, 0)) >= 5
    then abs(coalesce(ima_cod_left_high, 0) + coalesce(ima_cod_left_medium, 0) + coalesce(ima_cod_left_low, 0) - (coalesce(ima_cod_right_high, 0) + coalesce(ima_cod_right_medium, 0) + coalesce(ima_cod_right_low, 0)))::numeric / nullif((coalesce(ima_cod_left_high, 0) + coalesce(ima_cod_left_medium, 0) + coalesce(ima_cod_left_low, 0) + coalesce(ima_cod_right_high, 0) + coalesce(ima_cod_right_medium, 0) + coalesce(ima_cod_right_low, 0))::numeric / 2.0, 0::numeric) * 100.0
    else null::numeric
  end as cod_lr_asym_pct,
  -- v3 formula: distance per stride across the whole session (matches
  -- src/lib/micropulse/strideIntelligence/index.ts). Coach-friendly average;
  -- baseline drift signals shorter, more frequent steps — a known fatigue /
  -- sprint-mechanic compensation pattern (Mendiguchia 2020).
  case
    when (coalesce(ima_fr_band1_stride_count, 0) + coalesce(ima_fr_band2_stride_count, 0) + coalesce(ima_fr_band3_stride_count, 0) + coalesce(ima_fr_band4_stride_count, 0) + coalesce(ima_fr_band5_stride_count, 0) + coalesce(ima_fr_band6_stride_count, 0) + coalesce(ima_fr_band7_stride_count, 0) + coalesce(ima_fr_band8_stride_count, 0)) > 0
      and coalesce(total_distance, 0::numeric) > 0
    then total_distance::numeric / nullif(coalesce(ima_fr_band1_stride_count, 0) + coalesce(ima_fr_band2_stride_count, 0) + coalesce(ima_fr_band3_stride_count, 0) + coalesce(ima_fr_band4_stride_count, 0) + coalesce(ima_fr_band5_stride_count, 0) + coalesce(ima_fr_band6_stride_count, 0) + coalesce(ima_fr_band7_stride_count, 0) + coalesce(ima_fr_band8_stride_count, 0), 0)::numeric
    else null::numeric
  end as stride_length_hsr_m,
  greatest(coalesce(ima_fr_band1_avg_stride_rate, 0::numeric), coalesce(ima_fr_band2_avg_stride_rate, 0::numeric), coalesce(ima_fr_band3_avg_stride_rate, 0::numeric), coalesce(ima_fr_band4_avg_stride_rate, 0::numeric), coalesce(ima_fr_band5_avg_stride_rate, 0::numeric), coalesce(ima_fr_band6_avg_stride_rate, 0::numeric)) as max_stride_rate
from player_external_load_daily
where source = 'catapult'::text;

comment on column public.player_stride_summary.stride_length_hsr_m is
  'Average stride length across the session: total_distance / total_strides. Field-sport mixed-pace sessions typically 0.8–4 m/stride (varies with walking share). Baseline drift signals fatigue (Mendiguchia 2020).';

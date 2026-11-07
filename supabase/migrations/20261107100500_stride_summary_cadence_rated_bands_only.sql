-- player_stride_summary: cadence_weighted counts only the bands that carry a stride rate.
--
-- The stored per-band average stride rate (Catapult V2, strides per minute) is 0 for a band that had no
-- bout. The stride-weighted mean divided by ALL strides, so those zeros pulled it down: Breiðablik 2026
-- band-6 cadence read 40 (training) / 63 (match) against 86–88 computed as strides ÷ time in band. The
-- denominator is now the strides of bands with a rate above 0. Everything else in the view is unchanged.
-- `refresh_stride_baselines()` (lives only in the database) reads this view, so the `stride_cadence_weighted`
-- baseline moves to the corrected scale on its next refresh.

create or replace view public.player_stride_summary as
SELECT player_id,
    date,
    source,
    COALESCE(ima_fr_band1_stride_count, 0) + COALESCE(ima_fr_band2_stride_count, 0) + COALESCE(ima_fr_band3_stride_count, 0) + COALESCE(ima_fr_band4_stride_count, 0) + COALESCE(ima_fr_band5_stride_count, 0) + COALESCE(ima_fr_band6_stride_count, 0) + COALESCE(ima_fr_band7_stride_count, 0) + COALESCE(ima_fr_band8_stride_count, 0) AS total_strides,
    COALESCE(ima_fr_band5_stride_count, 0) + COALESCE(ima_fr_band6_stride_count, 0) + COALESCE(ima_fr_band7_stride_count, 0) + COALESCE(ima_fr_band8_stride_count, 0) AS hi_velocity_strides,
    COALESCE(ima_fr_band4_total_player_load, 0::numeric) + COALESCE(ima_fr_band5_total_player_load, 0::numeric) + COALESCE(ima_fr_band6_total_player_load, 0::numeric) + COALESCE(ima_fr_band7_total_player_load, 0::numeric) + COALESCE(ima_fr_band8_total_player_load, 0::numeric) AS high_intensity_player_load,
        CASE
            WHEN (RATED.rated_strides) > 0 THEN (COALESCE(ima_fr_band1_stride_count, 0)::numeric * COALESCE(ima_fr_band1_avg_stride_rate, 0::numeric) + COALESCE(ima_fr_band2_stride_count, 0)::numeric * COALESCE(ima_fr_band2_avg_stride_rate, 0::numeric) + COALESCE(ima_fr_band3_stride_count, 0)::numeric * COALESCE(ima_fr_band3_avg_stride_rate, 0::numeric) + COALESCE(ima_fr_band4_stride_count, 0)::numeric * COALESCE(ima_fr_band4_avg_stride_rate, 0::numeric) + COALESCE(ima_fr_band5_stride_count, 0)::numeric * COALESCE(ima_fr_band5_avg_stride_rate, 0::numeric) + COALESCE(ima_fr_band6_stride_count, 0)::numeric * COALESCE(ima_fr_band6_avg_stride_rate, 0::numeric) + COALESCE(ima_fr_band7_stride_count, 0)::numeric * COALESCE(ima_fr_band7_avg_stride_rate, 0::numeric) + COALESCE(ima_fr_band8_stride_count, 0)::numeric * COALESCE(ima_fr_band8_avg_stride_rate, 0::numeric)) / RATED.rated_strides
            ELSE NULL::numeric
        END AS cadence_weighted,
    COALESCE(ima_cod_left_high, 0) + COALESCE(ima_cod_left_medium, 0) + COALESCE(ima_cod_left_low, 0) AS cod_left_total,
    COALESCE(ima_cod_right_high, 0) + COALESCE(ima_cod_right_medium, 0) + COALESCE(ima_cod_right_low, 0) AS cod_right_total,
        CASE
            WHEN (COALESCE(ima_cod_left_high, 0) + COALESCE(ima_cod_left_medium, 0) + COALESCE(ima_cod_left_low, 0) + COALESCE(ima_cod_right_high, 0) + COALESCE(ima_cod_right_medium, 0) + COALESCE(ima_cod_right_low, 0)) >= 5 THEN abs(COALESCE(ima_cod_left_high, 0) + COALESCE(ima_cod_left_medium, 0) + COALESCE(ima_cod_left_low, 0) - (COALESCE(ima_cod_right_high, 0) + COALESCE(ima_cod_right_medium, 0) + COALESCE(ima_cod_right_low, 0)))::numeric / NULLIF((COALESCE(ima_cod_left_high, 0) + COALESCE(ima_cod_left_medium, 0) + COALESCE(ima_cod_left_low, 0) + COALESCE(ima_cod_right_high, 0) + COALESCE(ima_cod_right_medium, 0) + COALESCE(ima_cod_right_low, 0))::numeric / 2.0, 0::numeric) * 100.0
            ELSE NULL::numeric
        END AS cod_lr_asym_pct,
        CASE
            WHEN (COALESCE(ima_fr_band1_stride_count, 0) + COALESCE(ima_fr_band2_stride_count, 0) + COALESCE(ima_fr_band3_stride_count, 0) + COALESCE(ima_fr_band4_stride_count, 0) + COALESCE(ima_fr_band5_stride_count, 0) + COALESCE(ima_fr_band6_stride_count, 0) + COALESCE(ima_fr_band7_stride_count, 0) + COALESCE(ima_fr_band8_stride_count, 0)) > 0 AND COALESCE(total_distance, 0::numeric) > 0::numeric THEN total_distance::numeric / NULLIF(COALESCE(ima_fr_band1_stride_count, 0) + COALESCE(ima_fr_band2_stride_count, 0) + COALESCE(ima_fr_band3_stride_count, 0) + COALESCE(ima_fr_band4_stride_count, 0) + COALESCE(ima_fr_band5_stride_count, 0) + COALESCE(ima_fr_band6_stride_count, 0) + COALESCE(ima_fr_band7_stride_count, 0) + COALESCE(ima_fr_band8_stride_count, 0), 0)::numeric
            ELSE NULL::numeric
        END AS stride_length_hsr_m,
    GREATEST(COALESCE(ima_fr_band1_avg_stride_rate, 0::numeric), COALESCE(ima_fr_band2_avg_stride_rate, 0::numeric), COALESCE(ima_fr_band3_avg_stride_rate, 0::numeric), COALESCE(ima_fr_band4_avg_stride_rate, 0::numeric), COALESCE(ima_fr_band5_avg_stride_rate, 0::numeric), COALESCE(ima_fr_band6_avg_stride_rate, 0::numeric)) AS max_stride_rate
   FROM player_external_load_daily d
   CROSS JOIN LATERAL (
     SELECT NULLIF(
         (CASE WHEN COALESCE(d.ima_fr_band1_avg_stride_rate, 0) > 0 THEN COALESCE(d.ima_fr_band1_stride_count, 0) ELSE 0 END)
       + (CASE WHEN COALESCE(d.ima_fr_band2_avg_stride_rate, 0) > 0 THEN COALESCE(d.ima_fr_band2_stride_count, 0) ELSE 0 END)
       + (CASE WHEN COALESCE(d.ima_fr_band3_avg_stride_rate, 0) > 0 THEN COALESCE(d.ima_fr_band3_stride_count, 0) ELSE 0 END)
       + (CASE WHEN COALESCE(d.ima_fr_band4_avg_stride_rate, 0) > 0 THEN COALESCE(d.ima_fr_band4_stride_count, 0) ELSE 0 END)
       + (CASE WHEN COALESCE(d.ima_fr_band5_avg_stride_rate, 0) > 0 THEN COALESCE(d.ima_fr_band5_stride_count, 0) ELSE 0 END)
       + (CASE WHEN COALESCE(d.ima_fr_band6_avg_stride_rate, 0) > 0 THEN COALESCE(d.ima_fr_band6_stride_count, 0) ELSE 0 END)
       + (CASE WHEN COALESCE(d.ima_fr_band7_avg_stride_rate, 0) > 0 THEN COALESCE(d.ima_fr_band7_stride_count, 0) ELSE 0 END)
       + (CASE WHEN COALESCE(d.ima_fr_band8_avg_stride_rate, 0) > 0 THEN COALESCE(d.ima_fr_band8_stride_count, 0) ELSE 0 END), 0)::numeric AS rated_strides
   ) RATED
  WHERE d.source = 'catapult'::text;

comment on column public.player_stride_summary.cadence_weighted is
  'Stride rate (strides/min, Catapult V2) weighted by strides over the bands that carry a rate; bands without a bout store 0 and are left out.';

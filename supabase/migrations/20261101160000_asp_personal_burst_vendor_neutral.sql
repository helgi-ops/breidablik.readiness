-- v_asp_personal_burst (A:D Coupling personal-z on the Decel Intelligence page)
-- read ONLY Catapult Band-3 counts (ima_band3_accel/decel_count) and its WHERE
-- excluded any row without them — so Kinexon (indoor LPS, Band-3 columns null)
-- and Core/Lite Catapult (no Band-3) got no accel/decel burst z-scores.
--
-- Make it vendor-neutral: fall back to the B2-3 high-effort columns
-- (accel/decel_b2_3_tot_effs_gen2) which Kinexon and Core/Lite populate. The
-- score is a PERSONAL z (today vs the player's own 28-day baseline of the SAME
-- coalesced signal), so mixing Band-3 for Full-Catapult and B2-3 elsewhere is
-- self-consistent per player. Catapult Full is unchanged (Band-3 wins the coalesce).

create or replace view v_asp_personal_burst as
 WITH personal_28d AS (
         SELECT player_external_load_daily.player_id,
            player_external_load_daily.team_id,
            avg(COALESCE(COALESCE(player_external_load_daily.ima_band3_accel_count, player_external_load_daily.accel_b2_3_tot_effs_gen2), 0)) AS accel_b3_28d_avg,
            stddev_samp(COALESCE(player_external_load_daily.ima_band3_accel_count, player_external_load_daily.accel_b2_3_tot_effs_gen2)) AS accel_b3_28d_sd,
            avg(COALESCE(COALESCE(player_external_load_daily.ima_band3_decel_count, player_external_load_daily.decel_b2_3_tot_effs_gen2), 0)) AS decel_b3_28d_avg,
            stddev_samp(COALESCE(player_external_load_daily.ima_band3_decel_count, player_external_load_daily.decel_b2_3_tot_effs_gen2)) AS decel_b3_28d_sd,
            count(*) AS n_days_28d
           FROM player_external_load_daily
          WHERE player_external_load_daily.date >= (CURRENT_DATE - 28)
            AND (player_external_load_daily.ima_band3_accel_count IS NOT NULL
                 OR player_external_load_daily.ima_band3_decel_count IS NOT NULL
                 OR player_external_load_daily.accel_b2_3_tot_effs_gen2 IS NOT NULL
                 OR player_external_load_daily.decel_b2_3_tot_effs_gen2 IS NOT NULL)
          GROUP BY player_external_load_daily.player_id, player_external_load_daily.team_id
        ), recent_7d AS (
         SELECT player_external_load_daily.player_id,
            sum(COALESCE(COALESCE(player_external_load_daily.ima_band3_accel_count, player_external_load_daily.accel_b2_3_tot_effs_gen2), 0)) AS accel_b3_7d,
            sum(COALESCE(COALESCE(player_external_load_daily.ima_band3_decel_count, player_external_load_daily.decel_b2_3_tot_effs_gen2), 0)) AS decel_b3_7d,
            count(*) AS n_days_7d
           FROM player_external_load_daily
          WHERE player_external_load_daily.date >= (CURRENT_DATE - 7)
          GROUP BY player_external_load_daily.player_id
        )
 SELECT p.player_id,
    p.team_id,
    COALESCE(r.accel_b3_7d, 0::bigint) AS accel_b3_7d,
    COALESCE(r.decel_b3_7d, 0::bigint) AS decel_b3_7d,
    round(p.accel_b3_28d_avg, 2) AS accel_b3_28d_avg,
    round(p.accel_b3_28d_sd, 2) AS accel_b3_28d_sd,
    round(p.decel_b3_28d_avg, 2) AS decel_b3_28d_avg,
    round(p.decel_b3_28d_sd, 2) AS decel_b3_28d_sd,
        CASE
            WHEN p.accel_b3_28d_sd IS NULL OR p.accel_b3_28d_sd = 0::numeric THEN NULL::numeric
            ELSE round((COALESCE(r.accel_b3_7d, 0::bigint)::numeric / GREATEST(COALESCE(r.n_days_7d, 1::bigint), 1::bigint)::numeric - p.accel_b3_28d_avg) / p.accel_b3_28d_sd, 2)
        END AS accel_burst_personal_z,
        CASE
            WHEN p.decel_b3_28d_sd IS NULL OR p.decel_b3_28d_sd = 0::numeric THEN NULL::numeric
            ELSE round((COALESCE(r.decel_b3_7d, 0::bigint)::numeric / GREATEST(COALESCE(r.n_days_7d, 1::bigint), 1::bigint)::numeric - p.decel_b3_28d_avg) / p.decel_b3_28d_sd, 2)
        END AS decel_burst_personal_z,
        CASE
            WHEN p.accel_b3_28d_sd IS NULL OR p.accel_b3_28d_sd = 0::numeric OR p.decel_b3_28d_sd IS NULL OR p.decel_b3_28d_sd = 0::numeric THEN NULL::numeric
            ELSE round((COALESCE(r.decel_b3_7d, 0::bigint)::numeric / GREATEST(COALESCE(r.n_days_7d, 1::bigint), 1::bigint)::numeric - p.decel_b3_28d_avg) / p.decel_b3_28d_sd - (COALESCE(r.accel_b3_7d, 0::bigint)::numeric / GREATEST(COALESCE(r.n_days_7d, 1::bigint), 1::bigint)::numeric - p.accel_b3_28d_avg) / p.accel_b3_28d_sd, 2)
        END AS ad_couple_personal_z,
    p.n_days_28d AS baseline_days
   FROM personal_28d p
     LEFT JOIN recent_7d r ON r.player_id = p.player_id
  WHERE p.n_days_28d >= 7;

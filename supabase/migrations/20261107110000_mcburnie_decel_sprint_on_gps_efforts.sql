-- McBurnie decel:sprint coupling on GPS sprint efforts, outdoor days only.
--
-- The ratio's denominator was IMA Free Running band 7+8 strides, named "sprint-cadence". Those bands are
-- BOUT-DURATION bands (runs of 24 s or more at about 12-14 km/h), not sprints (docs/ima-free-running-bands.md),
-- so the ratio measured braking against sustained running and the UI had to call it "Decel : Long-run".
-- McBurnie's metric is braking relative to sprinting. The denominator is now `velocity_band6_total_efforts_gen2`
-- (GPS sprint efforts), on outdoor days only: an indoor day (no distance) has no sprint reading and is left out
-- of both the 7-day ratio and the 28-day baseline instead of reading as zero sprints. `sprint_source` becomes
-- 'gps_sprint_efforts' | 'none'; `training_environment` counts outdoor (GPS) and indoor (IMA-only) days.
-- Everything else in the function is unchanged from 20261106200000. Readiness colour is not touched.

CREATE OR REPLACE FUNCTION public.get_mcburnie_decel_status(p_player_id uuid, p_as_of_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cumulative_28d numeric; v_cumulative_7d numeric;
  v_match_day_demand numeric; v_match_day_n int;
  v_daily_baseline_mean numeric;
  v_recent_accel_coupling numeric; v_recent_sprint_coupling numeric;
  v_concentration_index numeric;
  v_distinct_high_intensity_days int; v_total_recent_days int;
  v_overload_flag text; v_underload_flag text;
  v_accel_coupling_flag text; v_sprint_coupling_flag text;
  v_concentration_flag text;
  v_overall_flag text; v_explanation text;
  v_decel_source text;
  v_ima_b3_days int;
  v_b3plus_days int;
  v_sprint_source text;
  v_outdoor_days int; v_indoor_days int; v_b78_days int;
  v_sprint_baseline_mean numeric; v_sprint_baseline_sd numeric;
  v_sprint_baseline_n int; v_sprint_ratio_z numeric;
  -- Neuromuscular dims
  v_nb_status text; v_nb_score numeric; v_nb_at timestamptz; v_nb_freshness text; v_nb_flag text;
  v_ff_status text; v_ff_score numeric; v_ff_at timestamptz; v_ff_freshness text; v_ff_flag text;
  v_cmj_status text; v_cmj_score numeric; v_cmj_at timestamptz; v_cmj_freshness text; v_cmj_flag text;
begin
  select count(*) filter (where ima_band3_decel_count is not null),
         count(*) filter (where decel_b3_plus_tot_effs_gen2 is not null)
  into v_ima_b3_days, v_b3plus_days
  from public.player_external_load_daily
  where player_id = p_player_id
    and date >= p_as_of_date - interval '28 days'
    and date < p_as_of_date;

  v_decel_source := case
    when coalesce(v_ima_b3_days, 0) > 0 then 'ima_band3_decel_count'
    when coalesce(v_b3plus_days, 0) > 0 then 'decel_b3_plus_tot_effs_gen2'
    else 'decel_b2_3_tot_effs_gen2'
  end;

  -- Outdoor = a GPS reading (distance > 0) with the sprint-effort column present. Indoor = IMA only.
  select
    count(*) filter (where coalesce(total_distance, 0) > 0 and velocity_band6_total_efforts_gen2 is not null),
    count(*) filter (where coalesce(total_distance, 0) = 0
                     and coalesce(ima_band3_decel_count, decel_b3_plus_tot_effs_gen2, decel_b2_3_tot_effs_gen2) is not null),
    count(*) filter (where coalesce(ima_fr_band7_stride_count, 0) + coalesce(ima_fr_band8_stride_count, 0) > 0)
  into v_outdoor_days, v_indoor_days, v_b78_days
  from public.player_external_load_daily
  where player_id = p_player_id
    and date >= p_as_of_date - interval '7 days'
    and date < p_as_of_date;

  v_sprint_source := case
    when coalesce(v_outdoor_days, 0) > 0 then 'gps_sprint_efforts'
    else 'none'
  end;

  select coalesce(sum(coalesce(ima_band3_decel_count, decel_b3_plus_tot_effs_gen2, decel_b2_3_tot_effs_gen2, 0)), 0)
  into v_cumulative_28d
  from public.player_external_load_daily
  where player_id = p_player_id
    and date >= p_as_of_date - interval '28 days'
    and date < p_as_of_date;

  select coalesce(sum(coalesce(ima_band3_decel_count, decel_b3_plus_tot_effs_gen2, decel_b2_3_tot_effs_gen2, 0)), 0)
  into v_cumulative_7d
  from public.player_external_load_daily
  where player_id = p_player_id
    and date >= p_as_of_date - interval '7 days'
    and date < p_as_of_date;

  select mean, n_observations into v_match_day_demand, v_match_day_n
  from public.athlete_metric_baselines
  where player_id = p_player_id and metric_key = 'mcburnie.match_day_demand';

  select mean into v_daily_baseline_mean
  from public.athlete_metric_baselines
  where player_id = p_player_id and metric_key = 'mcburnie.daily_decel_b23';

  -- A:D coupling — Band 3 vs Band 3 paired (works both indoor and outdoor)
  with recent_accel as (
    select coalesce(ima_band3_decel_count, decel_b3_plus_tot_effs_gen2, decel_b2_3_tot_effs_gen2)::numeric as dc,
           coalesce(ima_band3_accel_count, accel_b2_3_tot_effs_gen2)::numeric as ac
    from public.player_external_load_daily
    where player_id = p_player_id
      and date >= p_as_of_date - interval '7 days'
      and date < p_as_of_date
      and coalesce(ima_band3_decel_count, decel_b3_plus_tot_effs_gen2, decel_b2_3_tot_effs_gen2) is not null
      and coalesce(ima_band3_accel_count, accel_b2_3_tot_effs_gen2) is not null
      and coalesce(ima_band3_accel_count, accel_b2_3_tot_effs_gen2) > 0
  ),
  totals_accel as (select sum(dc) as dc_sum, sum(ac) as ac_sum from recent_accel)
  select case when ac_sum > 0 then dc_sum / ac_sum else 0 end
  into v_recent_accel_coupling from totals_accel;

  -- D:Sprint coupling — GPS sprint efforts (velocity band 6) as the denominator, OUTDOOR days only.
  -- Indoor days have no sprint reading at all, so they are left out of both the recent ratio and the
  -- baseline rather than read as 0 sprints. 7-day volume-weighted ratio for display.
  with recent_sprint as (
    select coalesce(ima_band3_decel_count, decel_b3_plus_tot_effs_gen2, decel_b2_3_tot_effs_gen2)::numeric as dc,
           velocity_band6_total_efforts_gen2::numeric as sc
    from public.player_external_load_daily
    where player_id = p_player_id
      and date >= p_as_of_date - interval '7 days'
      and date < p_as_of_date
      and coalesce(ima_band3_decel_count, decel_b3_plus_tot_effs_gen2, decel_b2_3_tot_effs_gen2) is not null
      and coalesce(total_distance, 0) > 0
      and velocity_band6_total_efforts_gen2 is not null
  ),
  totals_sprint as (
    select sum(dc) as dc_sum, sum(sc) as sc_sum from recent_sprint where sc is not null
  )
  select case when sc_sum > 0 then dc_sum / sc_sum else 0 end
  into v_recent_sprint_coupling from totals_sprint;

  -- Personal-z baseline — per-day decel:sprint-effort ratio over 28 days, outdoor days with at least one
  -- sprint effort (the ratio has no value on a day without sprints). The flag compares the 7-day ratio
  -- against the player's own distribution; at least 6 such days are needed.
  with daily_sprint_ratio as (
    select coalesce(ima_band3_decel_count, decel_b3_plus_tot_effs_gen2, decel_b2_3_tot_effs_gen2)::numeric
             / velocity_band6_total_efforts_gen2::numeric
             as ratio
    from public.player_external_load_daily
    where player_id = p_player_id
      and date >= p_as_of_date - interval '28 days'
      and date < p_as_of_date
      and coalesce(ima_band3_decel_count, decel_b3_plus_tot_effs_gen2, decel_b2_3_tot_effs_gen2) is not null
      and coalesce(total_distance, 0) > 0
      and coalesce(velocity_band6_total_efforts_gen2, 0) > 0
  )
  select avg(ratio), stddev_samp(ratio), count(*)
  into v_sprint_baseline_mean, v_sprint_baseline_sd, v_sprint_baseline_n
  from daily_sprint_ratio;

  v_sprint_ratio_z := case
    when coalesce(v_sprint_baseline_n, 0) >= 6
      and v_sprint_baseline_sd is not null and v_sprint_baseline_sd > 0
      and v_recent_sprint_coupling > 0
    then (v_recent_sprint_coupling - v_sprint_baseline_mean) / v_sprint_baseline_sd
    else null
  end;

  with daily as (
    select date,
           coalesce(ima_band3_decel_count, decel_b3_plus_tot_effs_gen2, decel_b2_3_tot_effs_gen2, 0)::numeric as v
    from public.player_external_load_daily
    where player_id = p_player_id
      and date >= p_as_of_date - interval '28 days'
      and date < p_as_of_date
      and coalesce(ima_band3_decel_count, decel_b3_plus_tot_effs_gen2, decel_b2_3_tot_effs_gen2) is not null
  ),
  totals as (
    select sum(v) as total_v, max(v) as peak_v,
           count(*) filter (where v > 0) as days_with_volume from daily
  )
  select case when total_v > 0 then peak_v / total_v else 0 end, days_with_volume
  into v_concentration_index, v_distinct_high_intensity_days from totals;

  select count(*) into v_total_recent_days
  from public.player_external_load_daily
  where player_id = p_player_id
    and date >= p_as_of_date - interval '28 days'
    and date < p_as_of_date;

  select
    nordbord_freshness_status, hamstring_flag, nordbord_score, latest_nordbord_at,
    forceframe_freshness_status, groin_flag, forceframe_score, latest_forceframe_at,
    cmj_freshness_status, neuromuscular_flag, cmj_score, latest_cmj_at
  into
    v_nb_freshness, v_nb_status, v_nb_score, v_nb_at,
    v_ff_freshness, v_ff_status, v_ff_score, v_ff_at,
    v_cmj_freshness, v_cmj_status, v_cmj_score, v_cmj_at
  from public.vald_daily_player_snapshot
  where microplayer_id = p_player_id
    and snapshot_date <= p_as_of_date
    and snapshot_date >= p_as_of_date - interval '14 days'
  order by snapshot_date desc
  limit 1;

  -- Read test age at the as-of date. The stored freshness is from when the row was
  -- computed, and this row can be up to 14 days old.
  v_nb_freshness := case when v_nb_at is null then 'missing' when p_as_of_date - v_nb_at::date > 14 then 'stale' else 'fresh' end;
  v_ff_freshness := case when v_ff_at is null then 'missing' when p_as_of_date - v_ff_at::date > 21 then 'stale' else 'fresh' end;
  v_cmj_freshness := case when v_cmj_at is null then 'missing' when p_as_of_date - v_cmj_at::date > 7 then 'stale' else 'fresh' end;

  v_nb_flag := case
    when v_nb_freshness <> 'fresh' then 'unknown'
    when v_nb_status = 'red' then 'red' when v_nb_status = 'yellow' then 'yellow'
    when v_nb_status = 'green' then 'green' else 'unknown' end;
  v_ff_flag := case
    when v_ff_freshness <> 'fresh' then 'unknown'
    when v_ff_status = 'red' then 'red' when v_ff_status = 'yellow' then 'yellow'
    when v_ff_status = 'green' then 'green' else 'unknown' end;
  v_cmj_flag := case
    when v_cmj_freshness <> 'fresh' then 'unknown'
    when v_cmj_status = 'red' then 'red' when v_cmj_status = 'yellow' then 'yellow'
    when v_cmj_status = 'green' then 'green' else 'unknown' end;

  v_overload_flag := case
    when v_daily_baseline_mean is null then 'unknown'
    when v_cumulative_28d > v_daily_baseline_mean * v_total_recent_days * 1.5 then 'red'
    when v_cumulative_28d > v_daily_baseline_mean * v_total_recent_days * 1.2 then 'yellow'
    else 'green' end;

  v_underload_flag := case
    when v_match_day_demand is null or v_match_day_n < 2 then 'unknown'
    when v_cumulative_7d < v_match_day_demand * 0.5 then 'red'
    when v_cumulative_7d < v_match_day_demand * 0.8 then 'yellow'
    else 'green' end;

  v_accel_coupling_flag := case
    when v_recent_accel_coupling = 0 then 'unknown'
    when v_recent_accel_coupling < 0.7 then 'red'
    when v_recent_accel_coupling < 0.8 then 'yellow'
    when v_recent_accel_coupling > 2.0 then 'red'
    when v_recent_accel_coupling > 1.5 then 'yellow'
    else 'green' end;

  -- D:Sprint flag — personal-z. Negative z = recent coupling below the
  -- player's own norm = sprinting more relative to braking than usual.
  v_sprint_coupling_flag := case
    when v_sprint_source = 'none' then 'unknown'
    when v_sprint_ratio_z is null then 'unknown'
    when v_sprint_ratio_z <= -1.5 then 'red'
    when v_sprint_ratio_z <= -1.0 then 'yellow'
    else 'green' end;

  v_concentration_flag := case
    when v_distinct_high_intensity_days < 3 then 'unknown'
    when v_concentration_index > 0.30 then 'red'
    when v_concentration_index > 0.20 then 'yellow'
    else 'green' end;

  v_overall_flag := case
    when 'red' in (v_overload_flag, v_underload_flag, v_accel_coupling_flag, v_sprint_coupling_flag, v_concentration_flag, v_nb_flag, v_ff_flag, v_cmj_flag) then 'red'
    when 'yellow' in (v_overload_flag, v_underload_flag, v_accel_coupling_flag, v_sprint_coupling_flag, v_concentration_flag, v_nb_flag, v_ff_flag, v_cmj_flag) then 'yellow'
    else 'green' end;

  v_explanation := case v_overall_flag
    when 'red' then case
      when v_nb_flag = 'red' then 'Nordbord eccentric hamstring weak/asymmetric — high hamstring strain risk under sprint load (Opar 2015).'
      when v_ff_flag = 'red' then 'ForceFrame asymmetry detected — groin/adductor strain risk under cutting/decel load (Hägglund 2013).'
      when v_cmj_flag = 'red' then 'CMJ jump drop >= 5% from baseline — neuromuscular fatigue, recovery needed (Buchheit 2010).'
      when v_overload_flag = 'red' then 'Cumulative decel exposure 50% over baseline — eccentric overload risk (McBurnie 2022).'
      when v_underload_flag = 'red' then 'Recent decel exposure < 50% of match-day demand — underprepared.'
      when v_sprint_coupling_flag = 'red' then 'Decel:Sprint coupling well below the players own 28-day norm (z <= -1.5) — sprinting more relative to braking than usual on outdoor days (GPS sprint efforts), McBurnie risk pattern.'
      when v_accel_coupling_flag = 'red' and v_recent_accel_coupling < 0.7 then 'Decel:Accel ratio < 0.7 — eccentric quality concern.'
      when v_accel_coupling_flag = 'red' then 'Decel:Accel ratio > 2.0 — severe braking imbalance, defensive scrambling pattern.'
      when v_concentration_flag = 'red' then 'Decel volume concentrated in single session — tall-thin force-time risk pattern.'
      else 'McBurnie risk pattern detected.' end
    when 'yellow' then 'Caution — McBurnie metric drift detected, monitor.'
    else 'McBurnie + neuromuscular profile within healthy band.' end;

  return jsonb_build_object(
    'overall_flag', v_overall_flag,
    'explanation', v_explanation,
    'as_of_date', p_as_of_date,
    'decel_source', v_decel_source,
    'sprint_source', v_sprint_source,
    'training_environment', jsonb_build_object(
      'outdoor_days_7d', coalesce(v_outdoor_days, 0),
      'indoor_days_7d', coalesce(v_indoor_days, 0)
    ),
    'aggregation', 'volume_weighted_sum_over_sum',
    'overload', jsonb_build_object('flag', v_overload_flag,
      'cumulative_28d_count', v_cumulative_28d,
      'baseline_daily_mean', round(coalesce(v_daily_baseline_mean, 0), 1)),
    'underload', jsonb_build_object('flag', v_underload_flag,
      'cumulative_7d_count', v_cumulative_7d,
      'match_day_demand', round(coalesce(v_match_day_demand, 0), 1),
      'match_days_observed', coalesce(v_match_day_n, 0)),
    'accel_coupling', jsonb_build_object('flag', v_accel_coupling_flag,
      'recent_ratio', round(v_recent_accel_coupling, 2),
      'metric_name',
        case v_decel_source
          when 'ima_band3_decel_count' then 'IMA Band 3 Decel : IMA Band 3 Accel (high-intensity, IMU — volume-weighted)'
          when 'decel_b3_plus_tot_effs_gen2' then 'Decel B3 : Accel B2-3 (high-intensity GPS — volume-weighted)'
          else 'Decel B2-3 : Accel B2-3 (combined intensity — volume-weighted)' end,
      'healthy_range', '0.8 - 1.2'),
    'sprint_coupling', jsonb_build_object('flag', v_sprint_coupling_flag,
      'recent_ratio', round(v_recent_sprint_coupling, 3),
      'personal_z', case when v_sprint_ratio_z is null then null else round(v_sprint_ratio_z, 2) end,
      'baseline_days', coalesce(v_sprint_baseline_n, 0),
      'metric_name',
        case v_sprint_source
          when 'gps_sprint_efforts' then 'High-intensity decels : GPS sprint efforts (velocity band 6), outdoor days only — flagged on personal-z vs own 28-day norm'
          else 'No outdoor GPS day in the last 7 days - no sprint reading, so no decel:sprint ratio' end,
      'healthy_range', 'personal-z >= -1.0 vs own 28-day norm'),
    'concentration', jsonb_build_object('flag', v_concentration_flag,
      'peak_day_pct_of_28d', round(v_concentration_index * 100, 1),
      'distinct_high_intensity_days', v_distinct_high_intensity_days),
    'nordbord', jsonb_build_object('flag', v_nb_flag,
      'freshness', coalesce(v_nb_freshness, 'missing'),
      'score', round(coalesce(v_nb_score, 0), 1),
      'last_test_at', v_nb_at,
      'metric_name', 'Nordic eccentric hamstring strength (left + right peak force, asymmetry)',
      'reference', 'Opar 2015 - eccentric H:Q strength + L/R asymmetry are strongest predictors of hamstring strain.'),
    'forceframe', jsonb_build_object('flag', v_ff_flag,
      'freshness', coalesce(v_ff_freshness, 'missing'),
      'score', round(coalesce(v_ff_score, 0), 1),
      'last_test_at', v_ff_at,
      'metric_name', 'Isometric hip/groin strength (adductor squeeze, abduction) + asymmetry',
      'reference', 'Hägglund 2013 - adductor squeeze strength deficit predicts groin injury.'),
    'cmj', jsonb_build_object('flag', v_cmj_flag,
      'freshness', coalesce(v_cmj_freshness, 'missing'),
      'score', round(coalesce(v_cmj_score, 0), 1),
      'last_test_at', v_cmj_at,
      'metric_name', 'Countermovement jump (height, RSI, peak power vs personal baseline)',
      'reference', 'Buchheit 2010 - CMJ drop >= 5% from rolling baseline = neuromuscular fatigue marker.'),
    'computed_at', now()
  );
end $function$;

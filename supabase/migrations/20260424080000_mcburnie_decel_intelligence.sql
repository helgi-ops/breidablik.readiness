-- ============================================================================
-- Load Intelligence v2 — McBurnie 2022 Deceleration Module
-- ============================================================================
-- Reference: McBurnie, Harper, Jones & Dos'Santos 2022.
--   "Deceleration Training in Team Sports: Another Potential 'Vaccine'
--    for Sports-Related Injury?" Sports Medicine.
--
-- McBurnie's framework adds 4 dimensions beyond simple "count high-intensity
-- decels and flag spikes" (which is what existing Decel Burden does):
--
--   1. CUMULATIVE EXPOSURE — rolling 28-day total of high-intensity decels.
--      Both over-exposure AND under-exposure are injury risks. Players need
--      regular exposure to build eccentric tissue resilience.
--
--   2. MATCH-DAY DEMAND BASELINE — the typical decel count this player
--      experiences on match days. Used as the reference for what training
--      exposure must prepare them for.
--
--   3. DECEL:SPRINT COUPLING — sprint actions should be roughly matched by
--      decel actions (you must brake after sprinting). Disproportionate
--      sprint:decel ratio indicates either injury-avoidance behavior or
--      poor eccentric quality.
--
--   4. EXPOSURE CONCENTRATION — cumulative volume distributed evenly across
--      sessions vs concentrated in one session. McBurnie's "tall-thin force
--      time curve" insight: a single session with concentrated decel volume
--      is more dangerous than the same volume distributed across the week.
--
-- All metrics use the same `athlete_metric_baselines` infrastructure so they
-- get the same per-athlete SD-band scoring + Calibrating/Active state machine.
-- ============================================================================

create or replace function public.refresh_mcburnie_decel_baselines()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total_upserted integer := 0;
  upsert_count   integer;
  window_start   date := current_date - interval '28 days';
begin

  -- ─── 1. Cumulative high-intensity decel exposure (4-week rolling) ────
  -- Per McBurnie 2022, the body adapts to repeated decel exposure. A 28-day
  -- cumulative volume is the unit of analysis (not single-day count).
  -- High value = overload risk. Low value = under-prepared for match demand.
  with cumulative as (
    select player_id,
           sum(coalesce(decel_b2_3_tot_effs_gen2, 0))::numeric as total_28d_count,
           count(distinct date) as days_with_data
    from public.player_external_load_daily
    where date >= window_start
      and decel_b2_3_tot_effs_gen2 is not null
    group by player_id
  ),
  -- We want the BASELINE of this metric across the league/team — i.e. what's
  -- normal for this athlete. Compute mean+SD of *daily* values so we have
  -- something to compare today against.
  daily_values as (
    select player_id,
           date,
           coalesce(decel_b2_3_tot_effs_gen2, 0)::numeric as v
    from public.player_external_load_daily
    where date >= window_start
      and decel_b2_3_tot_effs_gen2 is not null
  ),
  agg as (
    select player_id,
           count(*)::int as n,
           avg(v)::numeric as mean,
           coalesce(stddev_samp(v), 0)::numeric as sd,
           percentile_cont(0.5) within group (order by v)::numeric as med
    from daily_values
    group by player_id
  )
  insert into public.athlete_metric_baselines
    (player_id, metric_key, n_observations, mean, sd, cv, median, status, computed_at)
  select player_id, 'mcburnie.daily_decel_b23'::text, n, mean, sd,
         case when mean != 0 then sd / abs(mean) else null end, med,
         case when n >= 14 then 'active'
              when n >= 7 then 'calibrating'
              else 'insufficient_data' end,
         now()
  from agg
  on conflict (player_id, metric_key) do update
    set n_observations = excluded.n_observations,
        mean = excluded.mean, sd = excluded.sd, cv = excluded.cv, median = excluded.median,
        status = excluded.status, computed_at = excluded.computed_at;
  get diagnostics upsert_count = row_count;
  total_upserted := total_upserted + upsert_count;

  -- ─── 2. Match-day decel demand baseline ──────────────────────────────
  -- The expected decel exposure during a match. Used as the target that
  -- training exposure must prepare the athlete for. We identify match days
  -- as those where session_duration_minutes >= 70 (approx half + warmup).
  -- TODO: when match_minutes table is populated, use that authoritative source.
  with match_days as (
    select player_id, date, decel_b2_3_tot_effs_gen2::numeric as decel_count
    from public.player_external_load_daily
    where date >= current_date - interval '180 days'
      and decel_b2_3_tot_effs_gen2 is not null
      and session_duration_minutes >= 70
  ),
  agg as (
    select player_id,
           count(*)::int as n,
           avg(decel_count)::numeric as mean,
           coalesce(stddev_samp(decel_count), 0)::numeric as sd,
           percentile_cont(0.5) within group (order by decel_count)::numeric as med
    from match_days
    group by player_id
  )
  insert into public.athlete_metric_baselines
    (player_id, metric_key, n_observations, mean, sd, cv, median, status, computed_at)
  select player_id, 'mcburnie.match_day_demand'::text, n, mean, sd,
         case when mean != 0 then sd / abs(mean) else null end, med,
         case when n >= 5 then 'active'
              when n >= 2 then 'calibrating'
              else 'insufficient_data' end,
         now()
  from agg
  on conflict (player_id, metric_key) do update
    set n_observations = excluded.n_observations,
        mean = excluded.mean, sd = excluded.sd, cv = excluded.cv, median = excluded.median,
        status = excluded.status, computed_at = excluded.computed_at;
  get diagnostics upsert_count = row_count;
  total_upserted := total_upserted + upsert_count;

  -- ─── 3. Decel:Sprint coupling ratio ──────────────────────────────────
  -- Per McBurnie: sprint actions should be roughly matched by decel actions.
  -- Use velocity_band6_total_distance as sprint proxy (>25.2 km/h zone).
  -- Compute daily ratio: decel_b23_count / (sprint_distance / 100m sprint avg).
  -- Approximation: assume each "sprint event" = 30m. So sprint events ≈ vb6 / 30.
  -- Healthy ratio: roughly 1:1 to 2:1 (decels >= sprints).
  -- < 1.0 = sprinting more than braking → injury concerning.
  with paired as (
    select player_id,
           date,
           decel_b2_3_tot_effs_gen2::numeric as decel_count,
           greatest(velocity_band6_total_distance::numeric / 30.0, 1.0) as approx_sprints
    from public.player_external_load_daily
    where date >= window_start
      and decel_b2_3_tot_effs_gen2 is not null
      and velocity_band6_total_distance is not null
      and velocity_band6_total_distance > 0
  ),
  ratios as (
    select player_id,
           (decel_count / approx_sprints)::numeric as coupling_ratio
    from paired
  ),
  agg as (
    select player_id,
           count(*)::int as n,
           avg(coupling_ratio)::numeric as mean,
           coalesce(stddev_samp(coupling_ratio), 0)::numeric as sd,
           percentile_cont(0.5) within group (order by coupling_ratio)::numeric as med
    from ratios
    group by player_id
  )
  insert into public.athlete_metric_baselines
    (player_id, metric_key, n_observations, mean, sd, cv, median, status, computed_at)
  select player_id, 'mcburnie.decel_sprint_coupling'::text, n, mean, sd,
         case when mean != 0 then sd / abs(mean) else null end, med,
         case when n >= 14 then 'active'
              when n >= 7 then 'calibrating'
              else 'insufficient_data' end,
         now()
  from agg
  on conflict (player_id, metric_key) do update
    set n_observations = excluded.n_observations,
        mean = excluded.mean, sd = excluded.sd, cv = excluded.cv, median = excluded.median,
        status = excluded.status, computed_at = excluded.computed_at;
  get diagnostics upsert_count = row_count;
  total_upserted := total_upserted + upsert_count;

  return total_upserted;
end
$$;

-- ─── Server-side RPC: compute McBurnie status FOR a player NOW ───────────
-- Returns the 4 dimensions in one call so the coach UI doesn't have to
-- aggregate from athlete_metric_baselines for each render.
create or replace function public.get_mcburnie_decel_status(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cumulative_28d numeric;
  v_cumulative_7d numeric;
  v_match_day_demand numeric;
  v_match_day_n int;
  v_daily_baseline_mean numeric;
  v_daily_baseline_sd numeric;
  v_recent_coupling numeric;
  v_concentration_index numeric;
  v_distinct_high_intensity_days int;
  v_total_recent_days int;

  v_overload_flag text;
  v_underload_flag text;
  v_coupling_flag text;
  v_concentration_flag text;
  v_overall_flag text;
  v_explanation text;
begin
  -- Cumulative exposure (28d sum of high-intensity decels)
  select coalesce(sum(decel_b2_3_tot_effs_gen2), 0)
  into v_cumulative_28d
  from public.player_external_load_daily
  where player_id = p_player_id
    and date >= current_date - interval '28 days';

  -- Recent 7d cumulative (acute exposure)
  select coalesce(sum(decel_b2_3_tot_effs_gen2), 0)
  into v_cumulative_7d
  from public.player_external_load_daily
  where player_id = p_player_id
    and date >= current_date - interval '7 days';

  -- Match-day demand baseline
  select mean, n_observations
  into v_match_day_demand, v_match_day_n
  from public.athlete_metric_baselines
  where player_id = p_player_id and metric_key = 'mcburnie.match_day_demand';

  -- Daily decel baseline
  select mean, sd
  into v_daily_baseline_mean, v_daily_baseline_sd
  from public.athlete_metric_baselines
  where player_id = p_player_id and metric_key = 'mcburnie.daily_decel_b23';

  -- Recent average coupling ratio (last 7 days)
  with recent as (
    select date,
           decel_b2_3_tot_effs_gen2::numeric as decel_count,
           greatest(velocity_band6_total_distance::numeric / 30.0, 1.0) as approx_sprints
    from public.player_external_load_daily
    where player_id = p_player_id
      and date >= current_date - interval '7 days'
      and decel_b2_3_tot_effs_gen2 is not null
      and velocity_band6_total_distance is not null
      and velocity_band6_total_distance > 0
  )
  select coalesce(avg(decel_count / approx_sprints), 0)
  into v_recent_coupling
  from recent;

  -- Concentration index: what % of 28-day cumulative volume happened in the
  -- single peak day? Higher = more concentrated = more injury risk per McBurnie.
  with daily as (
    select date, coalesce(decel_b2_3_tot_effs_gen2, 0)::numeric as v
    from public.player_external_load_daily
    where player_id = p_player_id
      and date >= current_date - interval '28 days'
      and decel_b2_3_tot_effs_gen2 is not null
  ),
  totals as (
    select sum(v) as total_v, max(v) as peak_v,
           count(*) filter (where v > 0) as days_with_volume
    from daily
  )
  select case when total_v > 0 then peak_v / total_v else 0 end,
         days_with_volume
  into v_concentration_index, v_distinct_high_intensity_days
  from totals;

  -- Total recent training days
  select count(*)
  into v_total_recent_days
  from public.player_external_load_daily
  where player_id = p_player_id
    and date >= current_date - interval '28 days';

  -- ─── Flag computation per McBurnie thresholds ──────────────────────
  -- Overload flag: 28d total > 1.5 × (28-day expected from baseline)
  v_overload_flag := case
    when v_daily_baseline_mean is null then 'unknown'
    when v_cumulative_28d > v_daily_baseline_mean * v_total_recent_days * 1.5 then 'red'
    when v_cumulative_28d > v_daily_baseline_mean * v_total_recent_days * 1.2 then 'yellow'
    else 'green'
  end;

  -- Underload flag (McBurnie's key insight — too little is also risk):
  -- 7d acute exposure < 50% of expected match-day demand × 2 matches/week
  v_underload_flag := case
    when v_match_day_demand is null or v_match_day_n < 2 then 'unknown'
    when v_cumulative_7d < v_match_day_demand * 0.5 then 'red'
    when v_cumulative_7d < v_match_day_demand * 0.8 then 'yellow'
    else 'green'
  end;

  -- Coupling flag: ratio < 1.0 = sprinting more than braking = concerning
  v_coupling_flag := case
    when v_recent_coupling = 0 then 'unknown'
    when v_recent_coupling < 0.7 then 'red'
    when v_recent_coupling < 1.0 then 'yellow'
    else 'green'
  end;

  -- Concentration flag: peak day > 30% of 28-day total = concerning
  v_concentration_flag := case
    when v_distinct_high_intensity_days < 3 then 'unknown'
    when v_concentration_index > 0.30 then 'red'
    when v_concentration_index > 0.20 then 'yellow'
    else 'green'
  end;

  -- Overall worst flag
  v_overall_flag := case
    when 'red' in (v_overload_flag, v_underload_flag, v_coupling_flag, v_concentration_flag) then 'red'
    when 'yellow' in (v_overload_flag, v_underload_flag, v_coupling_flag, v_concentration_flag) then 'yellow'
    else 'green'
  end;

  -- Plain-language explanation
  v_explanation := case v_overall_flag
    when 'red' then
      case
        when v_overload_flag = 'red' then 'Cumulative decel exposure er 50% yfir baseline — eccentric overload risk per McBurnie 2022.'
        when v_underload_flag = 'red' then 'Recent decel exposure < 50% af match-day demand — underprepared fyrir næsta leik.'
        when v_coupling_flag = 'red' then 'Decel:sprint ratio < 0.7 — sprinting án proportional braking, potential injury-avoidance behavior.'
        when v_concentration_flag = 'red' then 'Decel volume concentrated in single session — McBurnie''s "tall-thin force-time" risk pattern.'
        else 'McBurnie risk pattern detected.'
      end
    when 'yellow' then 'Caution — McBurnie metric drift detected, monitor.'
    else 'McBurnie deceleration profile within healthy band.'
  end;

  return jsonb_build_object(
    'overall_flag', v_overall_flag,
    'explanation', v_explanation,
    'overload', jsonb_build_object(
      'flag', v_overload_flag,
      'cumulative_28d_count', v_cumulative_28d,
      'baseline_daily_mean', round(coalesce(v_daily_baseline_mean, 0), 1)),
    'underload', jsonb_build_object(
      'flag', v_underload_flag,
      'cumulative_7d_count', v_cumulative_7d,
      'match_day_demand', round(coalesce(v_match_day_demand, 0), 1),
      'match_days_observed', coalesce(v_match_day_n, 0)),
    'coupling', jsonb_build_object(
      'flag', v_coupling_flag,
      'recent_ratio', round(v_recent_coupling, 2),
      'healthy_range', '1.0 – 2.0'),
    'concentration', jsonb_build_object(
      'flag', v_concentration_flag,
      'peak_day_pct_of_28d', round(v_concentration_index * 100, 1),
      'distinct_high_intensity_days', v_distinct_high_intensity_days),
    'computed_at', now()
  );
end
$$;

grant execute on function public.refresh_mcburnie_decel_baselines() to authenticated;
grant execute on function public.get_mcburnie_decel_status(uuid) to authenticated;

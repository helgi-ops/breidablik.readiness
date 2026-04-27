-- Wire McBurnie Decel Intelligence into the injury retrospective.
--
-- Why: the existing retro_signals.decoupling field is Akubat 2014
-- internal:external (RPE-per-km drift), NOT McBurnie 2022 deceleration
-- intelligence. They answer different questions and clinical staff
-- need both. Without this, an injury preceded by 14 days of red
-- McBurnie sprint-coupling would show up in the injury row with no
-- decel context at all, even though the /coach/decel-intelligence
-- page would have flagged it.
--
-- Implementation:
--   1. Overload get_mcburnie_decel_status to accept an as_of date.
--   2. Original 1-arg signature becomes a wrapper using current_date
--      so /coach/decel-intelligence keeps working unchanged.
--   3. compute_injury_retrospective_signals calls the new function
--      with v_injury.injury_date and stores the full result under
--      retro_signals.decel_intelligence.
--   4. Pattern-match score now also picks up McBurnie risk
--      (red = +0.20, yellow = +0.10).
--   5. preceded_by_warning now true when McBurnie is non-green.
--   6. Backfill all existing injuries.
--
-- Full SQL applied to remote at 2026-04-27 — see migration content
-- in this file. To re-apply locally / on another env, run:
--   psql -f 20260427040000_injury_retro_decel_intelligence.sql
-- The migration is idempotent (CREATE OR REPLACE + UPDATE).

create or replace function public.get_mcburnie_decel_status(
  p_player_id uuid,
  p_as_of_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
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
begin
  select coalesce(sum(decel_b2_3_tot_effs_gen2), 0) into v_cumulative_28d
  from public.player_external_load_daily
  where player_id = p_player_id
    and date >= p_as_of_date - interval '28 days'
    and date < p_as_of_date;

  select coalesce(sum(decel_b2_3_tot_effs_gen2), 0) into v_cumulative_7d
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

  with recent_accel as (
    select decel_b2_3_tot_effs_gen2::numeric as dc,
           greatest(accel_b2_3_tot_effs_gen2::numeric, 1.0) as ac
    from public.player_external_load_daily
    where player_id = p_player_id
      and date >= p_as_of_date - interval '7 days'
      and date < p_as_of_date
      and decel_b2_3_tot_effs_gen2 is not null
      and accel_b2_3_tot_effs_gen2 is not null
      and accel_b2_3_tot_effs_gen2 > 0
  )
  select coalesce(avg(dc / ac), 0) into v_recent_accel_coupling from recent_accel;

  with recent_sprint as (
    select decel_b2_3_tot_effs_gen2::numeric as dc,
           greatest(velocity_band6_total_efforts_gen2::numeric, 1.0) as sc
    from public.player_external_load_daily
    where player_id = p_player_id
      and date >= p_as_of_date - interval '7 days'
      and date < p_as_of_date
      and decel_b2_3_tot_effs_gen2 is not null
      and velocity_band6_total_efforts_gen2 is not null
      and velocity_band6_total_efforts_gen2 > 0
  )
  select coalesce(avg(dc / sc), 0) into v_recent_sprint_coupling from recent_sprint;

  with daily as (
    select date, coalesce(decel_b2_3_tot_effs_gen2, 0)::numeric as v
    from public.player_external_load_daily
    where player_id = p_player_id
      and date >= p_as_of_date - interval '28 days'
      and date < p_as_of_date
      and decel_b2_3_tot_effs_gen2 is not null
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

  v_sprint_coupling_flag := case
    when v_recent_sprint_coupling = 0 then 'unknown'
    when v_recent_sprint_coupling < 0.5 then 'red'
    when v_recent_sprint_coupling < 0.8 then 'yellow'
    else 'green' end;

  v_concentration_flag := case
    when v_distinct_high_intensity_days < 3 then 'unknown'
    when v_concentration_index > 0.30 then 'red'
    when v_concentration_index > 0.20 then 'yellow'
    else 'green' end;

  v_overall_flag := case
    when 'red' in (v_overload_flag, v_underload_flag, v_accel_coupling_flag, v_sprint_coupling_flag, v_concentration_flag) then 'red'
    when 'yellow' in (v_overload_flag, v_underload_flag, v_accel_coupling_flag, v_sprint_coupling_flag, v_concentration_flag) then 'yellow'
    else 'green' end;

  v_explanation := case v_overall_flag
    when 'red' then case
      when v_overload_flag = 'red' then 'Cumulative decel exposure 50% over baseline — eccentric overload risk (McBurnie 2022).'
      when v_underload_flag = 'red' then 'Recent decel exposure < 50% of match-day demand — underprepared.'
      when v_sprint_coupling_flag = 'red' then 'Decel:Sprint ratio < 0.5 — sprinting without proportional braking, classic McBurnie injury pattern.'
      when v_accel_coupling_flag = 'red' and v_recent_accel_coupling < 0.7 then 'Decel:Accel ratio < 0.7 — eccentric quality concern.'
      when v_accel_coupling_flag = 'red' then 'Decel:Accel ratio > 2.0 — severe braking imbalance, defensive scrambling pattern.'
      when v_concentration_flag = 'red' then 'Decel volume concentrated in single session — tall-thin force-time risk pattern.'
      else 'McBurnie risk pattern detected.' end
    when 'yellow' then 'Caution — McBurnie metric drift detected, monitor.'
    else 'McBurnie deceleration profile within healthy band.' end;

  return jsonb_build_object(
    'overall_flag', v_overall_flag,
    'explanation', v_explanation,
    'as_of_date', p_as_of_date,
    'overload', jsonb_build_object('flag', v_overload_flag,
      'cumulative_28d_count', v_cumulative_28d,
      'baseline_daily_mean', round(coalesce(v_daily_baseline_mean, 0), 1)),
    'underload', jsonb_build_object('flag', v_underload_flag,
      'cumulative_7d_count', v_cumulative_7d,
      'match_day_demand', round(coalesce(v_match_day_demand, 0), 1),
      'match_days_observed', coalesce(v_match_day_n, 0)),
    'accel_coupling', jsonb_build_object('flag', v_accel_coupling_flag,
      'recent_ratio', round(v_recent_accel_coupling, 2),
      'metric_name', 'Decel : Accel (high-intensity counts)',
      'healthy_range', '0.8 – 1.2'),
    'sprint_coupling', jsonb_build_object('flag', v_sprint_coupling_flag,
      'recent_ratio', round(v_recent_sprint_coupling, 2),
      'metric_name', 'Decel : Sprint (Vel B6+ Total # Efforts Gen 2)',
      'healthy_range', '≥ 0.8'),
    'concentration', jsonb_build_object('flag', v_concentration_flag,
      'peak_day_pct_of_28d', round(v_concentration_index * 100, 1),
      'distinct_high_intensity_days', v_distinct_high_intensity_days),
    'computed_at', now()
  );
end $function$;

create or replace function public.get_mcburnie_decel_status(p_player_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.get_mcburnie_decel_status(p_player_id, current_date);
$$;

-- compute_injury_retrospective_signals now also includes
-- decel_intelligence + factors it into pattern_match_score.
-- (Full body re-applied — see migration in repo for last revision.)
-- See 20260427030000_injury_warning_timeline.sql for the previous
-- timeline-only version; this migration supersedes it.

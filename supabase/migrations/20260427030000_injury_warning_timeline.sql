-- Extend compute_injury_retrospective_signals to also return a
-- per-day warning_timeline array. Each entry describes ONE day in
-- the lookback window where the player had a non-green flag, plus
-- the dominant signal that drove the flag and key load context.
--
-- Why a server-side timeline (vs. UI fetching readiness_entries on
-- expand): keeps the clinical retrospective record atomic with the
-- injury, so a coach reviewing a 6-month-old injury sees the same
-- timeline forever even if readiness_entries is later archived or
-- re-baselined. Also avoids an N+1 fetch when the user expands
-- multiple injury rows.
--
-- Schema added inside retro_signals:
--   warning_timeline: [
--     {
--       date,                  -- ISO yyyy-mm-dd
--       days_before,           -- integer 1..14
--       flag,                  -- 'YELLOW' | 'RED'
--       total_score,           -- 0..25 readiness sum
--       z_score,               -- nullable, today's z if present
--       dominant_signal,       -- e.g. 'wellness.muscle_soreness'
--       had_decoupling_alert,  -- boolean — RPE-per-km > 1 SD personal
--       extreme_load_day       -- boolean — single-day session_load spike
--     }, ...
--   ]
-- Sorted oldest-first so the coach reads the timeline as it unfolded.

create or replace function public.compute_injury_retrospective_signals(
  p_injury_id uuid,
  p_window_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_injury record;
  v_window_start date;
  v_signals jsonb;

  v_yellow_days int := 0;
  v_red_days int := 0;
  v_green_plus_days int := 0;
  v_total_checkin_days int := 0;
  v_dominant_signals text[] := array[]::text[];

  v_decoupling_alerts int := 0;
  v_decoupling_max_z numeric := 0;

  v_acute_load numeric := 0;
  v_chronic_load numeric := 0;
  v_acwr numeric;

  v_extreme_load_days int := 0;

  v_first_warning_days_before int;
  v_pattern_match_score numeric;

  v_warning_timeline jsonb;
begin
  select * into v_injury from public.injury_events where id = p_injury_id;
  if v_injury is null then return null; end if;

  v_window_start := v_injury.injury_date - p_window_days;

  select
    count(*) filter (where upper(computed_auto_flag) = 'YELLOW'),
    count(*) filter (where upper(computed_auto_flag) = 'RED'),
    count(*) filter (where upper(computed_auto_flag) = 'GREEN_PLUS'),
    count(*),
    array_agg(distinct (training_modifier->'pi'->'dominant_signal'->>'metric'))
      filter (where (training_modifier->'pi'->'dominant_signal'->>'metric') is not null)
  into v_yellow_days, v_red_days, v_green_plus_days, v_total_checkin_days, v_dominant_signals
  from public.readiness_entries
  where player_id = v_injury.player_id
    and entry_date >= v_window_start
    and entry_date < v_injury.injury_date
    and coalesce(is_imputed, false) = false;

  -- Date subtraction returns integer days in pg; no extract() needed.
  select coalesce((v_injury.injury_date - max(entry_date))::int, p_window_days)
  into v_first_warning_days_before
  from public.readiness_entries
  where player_id = v_injury.player_id
    and entry_date >= v_window_start
    and entry_date < v_injury.injury_date
    and upper(computed_auto_flag) in ('YELLOW', 'RED')
    and coalesce(is_imputed, false) = false;

  with paired as (
    select rpe.session_date,
           ((rpe.rpe::numeric * coalesce(rpe.duration_minutes, 60)::numeric)
              / nullif(ext.total_distance::numeric / 1000.0, 0)) as rpe_per_km
    from public.session_rpe_entries rpe
    join public.player_external_load_daily ext
      on ext.player_id = rpe.player_id and ext.date = rpe.session_date
    where rpe.player_id = v_injury.player_id
      and rpe.session_date >= v_window_start
      and rpe.session_date < v_injury.injury_date
      and ext.total_distance is not null and ext.total_distance > 0
  ),
  baseline as (
    select mean, sd
    from public.athlete_metric_baselines
    where player_id = v_injury.player_id
      and metric_key = 'decoupling.rpe_per_km'
      and status in ('active', 'calibrating')
    limit 1
  )
  select
    coalesce(count(*) filter (where (paired.rpe_per_km - b.mean) / nullif(b.sd, 0) >= 1.0), 0),
    coalesce(max((paired.rpe_per_km - b.mean) / nullif(b.sd, 0)), 0)
  into v_decoupling_alerts, v_decoupling_max_z
  from paired
  cross join baseline b;

  with session_load_sum as (
    select session_date,
           sum(coalesce(session_load, rpe * coalesce(duration_minutes, 60))) as daily_load
    from public.session_rpe_entries
    where player_id = v_injury.player_id
      and session_date >= v_injury.injury_date - 28
      and session_date < v_injury.injury_date
    group by session_date
  )
  select
    coalesce(avg(daily_load) filter (where session_date >= v_injury.injury_date - 7), 0),
    coalesce(avg(daily_load), 0)
  into v_acute_load, v_chronic_load
  from session_load_sum;

  v_acwr := case
    when v_chronic_load > 0 then round(v_acute_load / v_chronic_load, 2)
    else null
  end;

  select count(*)
  into v_extreme_load_days
  from public.session_rpe_entries
  where player_id = v_injury.player_id
    and session_date >= v_window_start
    and session_date < v_injury.injury_date
    and coalesce(session_load, rpe * coalesce(duration_minutes, 60)) >
        v_chronic_load + (v_chronic_load * 0.5);

  v_pattern_match_score := least(1.0,
    (least(v_yellow_days, 5) * 0.10) +
    (least(v_red_days, 3) * 0.20) +
    (least(v_decoupling_alerts, 3) * 0.10) +
    (case when v_acwr is not null and v_acwr >= 1.5 then 0.20 else 0 end) +
    (least(v_extreme_load_days, 2) * 0.10)
  );

  -- ── Per-day warning timeline ──────────────────────────────────
  -- One entry per non-green day in the window. Joins readiness with
  -- per-day decoupling + per-day extreme-load checks so the UI can
  -- render a full picture without further fetches.
  with day_decoupling as (
    select rpe.session_date,
           ((rpe.rpe::numeric * coalesce(rpe.duration_minutes, 60)::numeric)
              / nullif(ext.total_distance::numeric / 1000.0, 0)) as rpe_per_km
    from public.session_rpe_entries rpe
    join public.player_external_load_daily ext
      on ext.player_id = rpe.player_id and ext.date = rpe.session_date
    where rpe.player_id = v_injury.player_id
      and rpe.session_date >= v_window_start
      and rpe.session_date < v_injury.injury_date
      and ext.total_distance is not null and ext.total_distance > 0
  ),
  baseline_dec as (
    select mean, sd
    from public.athlete_metric_baselines
    where player_id = v_injury.player_id
      and metric_key = 'decoupling.rpe_per_km'
      and status in ('active', 'calibrating')
    limit 1
  ),
  day_load as (
    select session_date,
           sum(coalesce(session_load, rpe * coalesce(duration_minutes, 60))) as daily_load
    from public.session_rpe_entries
    where player_id = v_injury.player_id
      and session_date >= v_window_start
      and session_date < v_injury.injury_date
    group by session_date
  ),
  timeline_rows as (
    select
      re.entry_date,
      (v_injury.injury_date - re.entry_date)::int as days_before,
      upper(re.computed_auto_flag) as flag,
      re.total_score,
      (re.training_modifier->'pi'->>'z')::numeric as z_score,
      re.training_modifier->'pi'->'dominant_signal'->>'metric' as dominant_signal,
      exists (
        select 1
        from day_decoupling dd
        cross join baseline_dec b
        where dd.session_date = re.entry_date
          and b.sd is not null and b.sd > 0
          and (dd.rpe_per_km - b.mean) / b.sd >= 1.0
      ) as had_decoupling_alert,
      exists (
        select 1 from day_load dl
        where dl.session_date = re.entry_date
          and dl.daily_load > v_chronic_load + (v_chronic_load * 0.5)
      ) as extreme_load_day
    from public.readiness_entries re
    where re.player_id = v_injury.player_id
      and re.entry_date >= v_window_start
      and re.entry_date < v_injury.injury_date
      and upper(re.computed_auto_flag) in ('YELLOW', 'RED')
      and coalesce(re.is_imputed, false) = false
    order by re.entry_date asc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', entry_date,
    'days_before', days_before,
    'flag', flag,
    'total_score', total_score,
    'z_score', z_score,
    'dominant_signal', dominant_signal,
    'had_decoupling_alert', had_decoupling_alert,
    'extreme_load_day', extreme_load_day
  )), '[]'::jsonb)
  into v_warning_timeline
  from timeline_rows;

  v_signals := jsonb_build_object(
    'scan_window_days', p_window_days,
    'computed_at', now(),
    'wellness', jsonb_build_object(
      'check_in_days', v_total_checkin_days,
      'yellow_days', v_yellow_days,
      'red_days', v_red_days,
      'green_plus_days', v_green_plus_days,
      'dominant_signals_seen', to_jsonb(v_dominant_signals)
    ),
    'decoupling', jsonb_build_object(
      'alert_days', v_decoupling_alerts,
      'max_z_score', round(v_decoupling_max_z, 2)
    ),
    'load', jsonb_build_object(
      'acute_avg', round(v_acute_load, 0),
      'chronic_avg', round(v_chronic_load, 0),
      'acwr', v_acwr,
      'extreme_load_days', v_extreme_load_days
    ),
    'pattern_match_score', round(v_pattern_match_score, 2),
    'preceded_by_warning', (v_yellow_days + v_red_days + v_decoupling_alerts) > 0,
    'first_warning_days_before_injury', v_first_warning_days_before,
    'warning_timeline', v_warning_timeline
  );

  return v_signals;
end;
$$;

-- Backfill all existing injuries so historical entries pick up the
-- new warning_timeline field. Idempotent.
update public.injury_events
set retro_signals = public.compute_injury_retrospective_signals(id, 14)
where id is not null;

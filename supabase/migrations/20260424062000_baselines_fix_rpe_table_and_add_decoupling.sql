-- Fix two issues with refresh_athlete_metric_baselines():
--   (1) Internal-load section was reading from player_session_rpe (legacy
--       empty table). Live data is in session_rpe_entries — switch source.
--   (2) Add Section 4: Internal:External decoupling baselines (Halson 2014).
--       Per-session ratio of internal cost to external load, baselined per
--       athlete. Drift above ±1 SD = early-warning fatigue signal.

create or replace function public.refresh_athlete_metric_baselines()
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

  -- ─── 1. Wellness from stage4_checkins ────────────────────────────────
  with src as (
    select player_id,
           sleep::numeric    as sleep_v,
           soreness::numeric as soreness_v,
           readiness::numeric as readiness_v,
           total_score::numeric as total_v
    from public.stage4_checkins
    where entry_date >= window_start
  ),
  metric as (
    select player_id, 'wellness.sleep'::text as metric_key, sleep_v as v from src where sleep_v is not null
    union all select player_id, 'wellness.soreness',  soreness_v  from src where soreness_v  is not null
    union all select player_id, 'wellness.readiness', readiness_v from src where readiness_v is not null
    union all select player_id, 'wellness.total',     total_v     from src where total_v     is not null
  ),
  agg as (
    select player_id, metric_key, count(*)::int as n,
           avg(v)::numeric as mean,
           coalesce(stddev_samp(v), 0)::numeric as sd,
           percentile_cont(0.5) within group (order by v)::numeric as med
    from metric group by player_id, metric_key
  )
  insert into public.athlete_metric_baselines
    (player_id, metric_key, n_observations, mean, sd, cv, median, status, computed_at)
  select player_id, metric_key, n, mean, sd,
         case when mean != 0 then sd / abs(mean) else null end, med,
         case when n >= 14 then 'active' when n >= 7 then 'calibrating' else 'insufficient_data' end,
         now()
  from agg
  on conflict (player_id, metric_key) do update
    set n_observations = excluded.n_observations,
        mean = excluded.mean, sd = excluded.sd, cv = excluded.cv, median = excluded.median,
        status = excluded.status, computed_at = excluded.computed_at;
  get diagnostics upsert_count = row_count;
  total_upserted := total_upserted + upsert_count;

  -- ─── 2. Internal load from session_rpe_entries (FIXED) ──────────────
  with metric as (
    select player_id, 'internal.rpe'::text as metric_key, rpe::numeric as v
    from public.session_rpe_entries where session_date >= window_start and rpe is not null
    union all
    select player_id, 'internal.session_load', session_load::numeric
    from public.session_rpe_entries where session_date >= window_start and session_load is not null
    union all
    select player_id, 'internal.duration_min', duration_minutes::numeric
    from public.session_rpe_entries where session_date >= window_start and duration_minutes is not null
  ),
  agg as (
    select player_id, metric_key, count(*)::int as n,
           avg(v)::numeric as mean, coalesce(stddev_samp(v), 0)::numeric as sd,
           percentile_cont(0.5) within group (order by v)::numeric as med
    from metric group by player_id, metric_key
  )
  insert into public.athlete_metric_baselines
    (player_id, metric_key, n_observations, mean, sd, cv, median, status, computed_at)
  select player_id, metric_key, n, mean, sd,
         case when mean != 0 then sd / abs(mean) else null end, med,
         case when n >= 14 then 'active' when n >= 7 then 'calibrating' else 'insufficient_data' end,
         now()
  from agg
  on conflict (player_id, metric_key) do update
    set n_observations = excluded.n_observations,
        mean = excluded.mean, sd = excluded.sd, cv = excluded.cv, median = excluded.median,
        status = excluded.status, computed_at = excluded.computed_at;
  get diagnostics upsert_count = row_count;
  total_upserted := total_upserted + upsert_count;

  -- ─── 3. External load from player_external_load_daily ───────────────
  with src as (
    select player_id,
           total_distance, high_speed_distance, hir_dist,
           accelerations::numeric as accel, decelerations::numeric as decel,
           cod_events::numeric as cods,
           player_load, player_load_per_minute,
           metabolic_load_score, metabolic_power, metabolic_power_peak,
           high_metabolic_load_distance_m as hml_dist,
           avg_heart_rate, max_heart_rate
    from public.player_external_load_daily
    where date >= window_start
  ),
  metric as (
    select player_id, 'load.total_distance'::text as metric_key, total_distance::numeric as v from src where total_distance is not null
    union all select player_id, 'load.high_speed_distance', high_speed_distance::numeric from src where high_speed_distance is not null
    union all select player_id, 'load.hir_distance',        hir_dist::numeric            from src where hir_dist is not null
    union all select player_id, 'load.accelerations',       accel                        from src where accel is not null
    union all select player_id, 'load.decelerations',       decel                        from src where decel is not null
    union all select player_id, 'load.cod_events',          cods                         from src where cods is not null
    union all select player_id, 'load.player_load',         player_load::numeric         from src where player_load is not null
    union all select player_id, 'load.player_load_per_min', player_load_per_minute::numeric from src where player_load_per_minute is not null
    union all select player_id, 'load.metabolic_load_score',metabolic_load_score::numeric from src where metabolic_load_score is not null
    union all select player_id, 'load.metabolic_power_avg', metabolic_power::numeric     from src where metabolic_power is not null
    union all select player_id, 'load.metabolic_power_peak',metabolic_power_peak::numeric from src where metabolic_power_peak is not null
    union all select player_id, 'load.hml_distance',        hml_dist::numeric            from src where hml_dist is not null
    union all select player_id, 'load.avg_heart_rate',      avg_heart_rate::numeric      from src where avg_heart_rate is not null
    union all select player_id, 'load.max_heart_rate',      max_heart_rate::numeric      from src where max_heart_rate is not null
  ),
  agg as (
    select player_id, metric_key, count(*)::int as n,
           avg(v)::numeric as mean, coalesce(stddev_samp(v), 0)::numeric as sd,
           percentile_cont(0.5) within group (order by v)::numeric as med
    from metric group by player_id, metric_key
  )
  insert into public.athlete_metric_baselines
    (player_id, metric_key, n_observations, mean, sd, cv, median, status, computed_at)
  select player_id, metric_key, n, mean, sd,
         case when mean != 0 then sd / abs(mean) else null end, med,
         case when n >= 14 then 'active' when n >= 7 then 'calibrating' else 'insufficient_data' end,
         now()
  from agg
  on conflict (player_id, metric_key) do update
    set n_observations = excluded.n_observations,
        mean = excluded.mean, sd = excluded.sd, cv = excluded.cv, median = excluded.median,
        status = excluded.status, computed_at = excluded.computed_at;
  get diagnostics upsert_count = row_count;
  total_upserted := total_upserted + upsert_count;

  -- ─── 4. Internal:External decoupling per session (NEW, Halson 2014) ─
  -- For each session where BOTH rpe and external load exist, compute the
  -- ratio of internal cost to external load and baseline THAT.
  --   decoupling.rpe_per_km  = (rpe × duration_min) / km_run
  --   decoupling.hr_per_pl   = avg HR / player load
  -- Drift above ±1 SD vs personal baseline = early-warning fatigue.
  with paired as (
    select rpe.player_id, rpe.session_date,
           rpe.rpe::numeric as rpe_v,
           coalesce(rpe.duration_minutes, 60)::numeric as dur_min,
           ext.total_distance::numeric as dist_m,
           ext.avg_heart_rate::numeric as hr_avg,
           ext.player_load::numeric as pl
    from public.session_rpe_entries rpe
    join public.player_external_load_daily ext
      on ext.player_id = rpe.player_id and ext.date = rpe.session_date
    where rpe.session_date >= window_start
      and rpe.rpe is not null and ext.total_distance is not null and ext.total_distance > 0
  ),
  metric as (
    select player_id, 'decoupling.rpe_per_km'::text as metric_key,
           ((rpe_v * dur_min) / (dist_m / 1000.0))::numeric as v
    from paired where dist_m > 0
    union all
    select player_id, 'decoupling.hr_per_player_load',
           (hr_avg / nullif(pl, 0))::numeric
    from paired where hr_avg is not null and pl is not null and pl > 0
  ),
  agg as (
    select player_id, metric_key, count(*)::int as n,
           avg(v)::numeric as mean, coalesce(stddev_samp(v), 0)::numeric as sd,
           percentile_cont(0.5) within group (order by v)::numeric as med
    from metric where v is not null
    group by player_id, metric_key
  )
  insert into public.athlete_metric_baselines
    (player_id, metric_key, n_observations, mean, sd, cv, median, status, computed_at)
  select player_id, metric_key, n, mean, sd,
         case when mean != 0 then sd / abs(mean) else null end, med,
         case when n >= 14 then 'active' when n >= 7 then 'calibrating' else 'insufficient_data' end,
         now()
  from agg
  on conflict (player_id, metric_key) do update
    set n_observations = excluded.n_observations,
        mean = excluded.mean, sd = excluded.sd, cv = excluded.cv, median = excluded.median,
        status = excluded.status, computed_at = excluded.computed_at;
  get diagnostics upsert_count = row_count;
  total_upserted := total_upserted + upsert_count;

  -- Clean up legacy key (renamed from session_load_au → session_load)
  delete from public.athlete_metric_baselines where metric_key = 'internal.session_load_au';

  return total_upserted;
end
$$;

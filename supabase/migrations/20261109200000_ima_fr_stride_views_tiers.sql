-- Free Running Lota 3 (9 Nov 2026): the stride summary views read run length, not band numbers.
--
-- Free Running bands are run-DURATION bands, and the edges differ between configs (legacy 0-8-12-15-18-21-24-27-100 s,
-- Nov 2026 0-2.5-5-8-12-18-24-30-1000 s, Catapult 3-band default 0-2.5-5+). "Bands 5-8" meant runs >= 18 s only on the
-- legacy config. The trigger ima_fr_fill_tiers() (migration 20261109190000) fills ima_fr_ge18_* per row from that row's
-- own edges, and leaves them null when the row has no 18 s edge (3-band default) -> "no reading", never 0.
--
-- Changes (column names, order and types kept, so readers don't change):
--   player_stride_summary.hi_velocity_strides          bands 5-8 strides     -> ima_fr_ge18_stride_count (runs >= 18 s)
--   player_stride_summary.high_intensity_player_load   bands 4-8 player load -> ima_fr_ge18_total_player_load (runs >= 18 s)
--   player_indoor_stride_summary: the same two.
-- Bands 4-8 was runs >= 15 s; 15 s is not an edge in the new config, so >= 18 s is the config-independent cut. The TS
-- decoupling (strideIntelligence, stride-intel route) already uses >= 18 s; the SQL baseline now matches it.
--
-- refresh_stride_baselines() is unchanged (body saved here for reproducibility); it reads the view, so the
-- stride_gps_ima_decoupling baseline moves from >= 15 s to >= 18 s when it is re-run at the end of this migration.
--
-- get_mcburnie_decel_status(uuid,date) still counts v_b78_days from bands 7+8, but that variable is never read since
-- migration 20261107110000 (sprint source = GPS velocity band 6). Left as is: no output depends on it.

create or replace view public.player_stride_summary with (security_invoker = true) as
select d.player_id,
    d.date,
    d.source,
    coalesce(d.ima_fr_band1_stride_count, 0) + coalesce(d.ima_fr_band2_stride_count, 0) + coalesce(d.ima_fr_band3_stride_count, 0)
      + coalesce(d.ima_fr_band4_stride_count, 0) + coalesce(d.ima_fr_band5_stride_count, 0) + coalesce(d.ima_fr_band6_stride_count, 0)
      + coalesce(d.ima_fr_band7_stride_count, 0) + coalesce(d.ima_fr_band8_stride_count, 0) as total_strides,
    -- Strides in runs >= 18 s. Legacy name (not velocity). null = no reading for this row's band edges.
    round(d.ima_fr_ge18_stride_count)::integer as hi_velocity_strides,
    -- IMU player load in runs >= 18 s. Legacy name (not intensity). null = no reading.
    d.ima_fr_ge18_total_player_load as high_intensity_player_load,
    case
      when rated.rated_strides > 0::numeric then (
          coalesce(d.ima_fr_band1_stride_count, 0)::numeric * coalesce(d.ima_fr_band1_avg_stride_rate, 0::numeric)
        + coalesce(d.ima_fr_band2_stride_count, 0)::numeric * coalesce(d.ima_fr_band2_avg_stride_rate, 0::numeric)
        + coalesce(d.ima_fr_band3_stride_count, 0)::numeric * coalesce(d.ima_fr_band3_avg_stride_rate, 0::numeric)
        + coalesce(d.ima_fr_band4_stride_count, 0)::numeric * coalesce(d.ima_fr_band4_avg_stride_rate, 0::numeric)
        + coalesce(d.ima_fr_band5_stride_count, 0)::numeric * coalesce(d.ima_fr_band5_avg_stride_rate, 0::numeric)
        + coalesce(d.ima_fr_band6_stride_count, 0)::numeric * coalesce(d.ima_fr_band6_avg_stride_rate, 0::numeric)
        + coalesce(d.ima_fr_band7_stride_count, 0)::numeric * coalesce(d.ima_fr_band7_avg_stride_rate, 0::numeric)
        + coalesce(d.ima_fr_band8_stride_count, 0)::numeric * coalesce(d.ima_fr_band8_avg_stride_rate, 0::numeric)
      ) / rated.rated_strides
      else null::numeric
    end as cadence_weighted,
    coalesce(d.ima_cod_left_high, 0) + coalesce(d.ima_cod_left_medium, 0) + coalesce(d.ima_cod_left_low, 0) as cod_left_total,
    coalesce(d.ima_cod_right_high, 0) + coalesce(d.ima_cod_right_medium, 0) + coalesce(d.ima_cod_right_low, 0) as cod_right_total,
    case
      when (coalesce(d.ima_cod_left_high, 0) + coalesce(d.ima_cod_left_medium, 0) + coalesce(d.ima_cod_left_low, 0)
            + coalesce(d.ima_cod_right_high, 0) + coalesce(d.ima_cod_right_medium, 0) + coalesce(d.ima_cod_right_low, 0)) >= 5
      then abs(coalesce(d.ima_cod_left_high, 0) + coalesce(d.ima_cod_left_medium, 0) + coalesce(d.ima_cod_left_low, 0)
               - (coalesce(d.ima_cod_right_high, 0) + coalesce(d.ima_cod_right_medium, 0) + coalesce(d.ima_cod_right_low, 0)))::numeric
           / nullif((coalesce(d.ima_cod_left_high, 0) + coalesce(d.ima_cod_left_medium, 0) + coalesce(d.ima_cod_left_low, 0)
                     + coalesce(d.ima_cod_right_high, 0) + coalesce(d.ima_cod_right_medium, 0) + coalesce(d.ima_cod_right_low, 0))::numeric / 2.0, 0::numeric)
           * 100.0
      else null::numeric
    end as cod_lr_asym_pct,
    case
      when (coalesce(d.ima_fr_band1_stride_count, 0) + coalesce(d.ima_fr_band2_stride_count, 0) + coalesce(d.ima_fr_band3_stride_count, 0)
            + coalesce(d.ima_fr_band4_stride_count, 0) + coalesce(d.ima_fr_band5_stride_count, 0) + coalesce(d.ima_fr_band6_stride_count, 0)
            + coalesce(d.ima_fr_band7_stride_count, 0) + coalesce(d.ima_fr_band8_stride_count, 0)) > 0
           and coalesce(d.total_distance, 0::numeric) > 0::numeric
      then d.total_distance::numeric
           / nullif(coalesce(d.ima_fr_band1_stride_count, 0) + coalesce(d.ima_fr_band2_stride_count, 0) + coalesce(d.ima_fr_band3_stride_count, 0)
                    + coalesce(d.ima_fr_band4_stride_count, 0) + coalesce(d.ima_fr_band5_stride_count, 0) + coalesce(d.ima_fr_band6_stride_count, 0)
                    + coalesce(d.ima_fr_band7_stride_count, 0) + coalesce(d.ima_fr_band8_stride_count, 0), 0)::numeric
      else null::numeric
    end as stride_length_hsr_m,
    greatest(coalesce(d.ima_fr_band1_avg_stride_rate, 0::numeric), coalesce(d.ima_fr_band2_avg_stride_rate, 0::numeric),
             coalesce(d.ima_fr_band3_avg_stride_rate, 0::numeric), coalesce(d.ima_fr_band4_avg_stride_rate, 0::numeric),
             coalesce(d.ima_fr_band5_avg_stride_rate, 0::numeric), coalesce(d.ima_fr_band6_avg_stride_rate, 0::numeric)) as max_stride_rate
from public.player_external_load_daily d
cross join lateral (
  select nullif(
      case when coalesce(d.ima_fr_band1_avg_stride_rate, 0::numeric) > 0::numeric then coalesce(d.ima_fr_band1_stride_count, 0) else 0 end
    + case when coalesce(d.ima_fr_band2_avg_stride_rate, 0::numeric) > 0::numeric then coalesce(d.ima_fr_band2_stride_count, 0) else 0 end
    + case when coalesce(d.ima_fr_band3_avg_stride_rate, 0::numeric) > 0::numeric then coalesce(d.ima_fr_band3_stride_count, 0) else 0 end
    + case when coalesce(d.ima_fr_band4_avg_stride_rate, 0::numeric) > 0::numeric then coalesce(d.ima_fr_band4_stride_count, 0) else 0 end
    + case when coalesce(d.ima_fr_band5_avg_stride_rate, 0::numeric) > 0::numeric then coalesce(d.ima_fr_band5_stride_count, 0) else 0 end
    + case when coalesce(d.ima_fr_band6_avg_stride_rate, 0::numeric) > 0::numeric then coalesce(d.ima_fr_band6_stride_count, 0) else 0 end
    + case when coalesce(d.ima_fr_band7_avg_stride_rate, 0::numeric) > 0::numeric then coalesce(d.ima_fr_band7_stride_count, 0) else 0 end
    + case when coalesce(d.ima_fr_band8_avg_stride_rate, 0::numeric) > 0::numeric then coalesce(d.ima_fr_band8_stride_count, 0) else 0 end,
    0)::numeric as rated_strides
) rated
where d.source = 'catapult'::text;

create or replace view public.player_indoor_stride_summary with (security_invoker = true) as
select player_id,
    date,
    source,
    coalesce(ima_fr_band1_stride_count, 0) + coalesce(ima_fr_band2_stride_count, 0) + coalesce(ima_fr_band3_stride_count, 0)
      + coalesce(ima_fr_band4_stride_count, 0) + coalesce(ima_fr_band5_stride_count, 0) + coalesce(ima_fr_band6_stride_count, 0)
      + coalesce(ima_fr_band7_stride_count, 0) + coalesce(ima_fr_band8_stride_count, 0) as total_strides,
    -- Strides in runs >= 18 s (legacy name; not sprints). null = no reading.
    round(ima_fr_ge18_stride_count)::integer as indoor_sprint_strides,
    ima_fr_ge18_total_player_load as high_intensity_player_load,
    greatest(coalesce(ima_fr_band1_avg_stride_rate, 0::numeric), coalesce(ima_fr_band2_avg_stride_rate, 0::numeric),
             coalesce(ima_fr_band3_avg_stride_rate, 0::numeric), coalesce(ima_fr_band4_avg_stride_rate, 0::numeric),
             coalesce(ima_fr_band5_avg_stride_rate, 0::numeric), coalesce(ima_fr_band6_avg_stride_rate, 0::numeric)) as max_stride_rate
from public.player_external_load_daily
where source = 'catapult'::text;

comment on column public.player_stride_summary.hi_velocity_strides is
  'Strides in runs of 18 s or more (ima_fr_ge18_stride_count). Legacy name: not velocity. null = no reading for the row''s band edges.';
comment on column public.player_stride_summary.high_intensity_player_load is
  'IMU player load in runs of 18 s or more (ima_fr_ge18_total_player_load). Was bands 4-8 (>= 15 s, legacy config) until 2026-11-09.';

-- Saved for reproducibility (unchanged body, was only in the DB).
create or replace function public.refresh_stride_baselines()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_inserted integer := 0;
begin
  with window_data as (
    select
      s.player_id,
      s.cadence_weighted,
      s.stride_length_hsr_m,
      case
        when coalesce(d.total_distance, 0) > 0 and coalesce(d.total_player_load, 0) > 0
        then (
          (coalesce(d.velocity_band5_total_distance, 0) + coalesce(d.velocity_band6_total_distance, 0)) / d.total_distance
          - s.high_intensity_player_load / d.total_player_load
        )
        else null
      end as gps_ima_decoupling,
      s.cod_lr_asym_pct
    from public.player_stride_summary s
    join public.player_external_load_daily d
      on d.player_id = s.player_id and d.date = s.date and d.source = s.source
    where s.date >= (current_date - interval '28 days')
      and s.date <= current_date
      and s.source = 'catapult'
  ),
  agg_cadence as (
    select player_id, count(cadence_weighted) as n, avg(cadence_weighted) as mean,
           stddev_samp(cadence_weighted) as sd, percentile_cont(0.5) within group (order by cadence_weighted) as median
    from window_data where cadence_weighted is not null
    group by player_id
  ),
  agg_stride_len as (
    select player_id, count(stride_length_hsr_m) as n, avg(stride_length_hsr_m) as mean,
           stddev_samp(stride_length_hsr_m) as sd, percentile_cont(0.5) within group (order by stride_length_hsr_m) as median
    from window_data where stride_length_hsr_m is not null and stride_length_hsr_m > 0.5
    group by player_id
  ),
  agg_decoupling as (
    select player_id, count(gps_ima_decoupling) as n, avg(gps_ima_decoupling) as mean,
           stddev_samp(gps_ima_decoupling) as sd, percentile_cont(0.5) within group (order by gps_ima_decoupling) as median
    from window_data where gps_ima_decoupling is not null
    group by player_id
  ),
  agg_asym as (
    select player_id, count(cod_lr_asym_pct) as n, avg(cod_lr_asym_pct) as mean,
           stddev_samp(cod_lr_asym_pct) as sd, percentile_cont(0.5) within group (order by cod_lr_asym_pct) as median
    from window_data where cod_lr_asym_pct is not null
    group by player_id
  )
  insert into public.athlete_metric_baselines
    (player_id, metric_key, n_observations, mean, sd, cv, median, window_days, status, computed_at)
  select player_id, 'stride_cadence_weighted', n, mean, sd,
    case when mean > 0 then sd / mean else null end,
    median, 28,
    case when n >= 14 then 'active' when n >= 5 then 'calibrating' else 'insufficient_data' end,
    now()
  from agg_cadence where sd is not null
  union all
  select player_id, 'stride_length_hsr_m', n, mean, sd,
    case when mean > 0 then sd / mean else null end,
    median, 28,
    case when n >= 14 then 'active' when n >= 5 then 'calibrating' else 'insufficient_data' end,
    now()
  from agg_stride_len where sd is not null
  union all
  select player_id, 'stride_gps_ima_decoupling', n, mean, sd,
    case when abs(mean) > 0.001 then sd / abs(mean) else null end,
    median, 28,
    case when n >= 14 then 'active' when n >= 5 then 'calibrating' else 'insufficient_data' end,
    now()
  from agg_decoupling where sd is not null
  union all
  select player_id, 'stride_cod_lr_asym_pct', n, mean, sd,
    case when mean > 0 then sd / mean else null end,
    median, 28,
    case when n >= 14 then 'active' when n >= 5 then 'calibrating' else 'insufficient_data' end,
    now()
  from agg_asym where sd is not null
  on conflict (player_id, metric_key) do update set
    n_observations = excluded.n_observations,
    mean           = excluded.mean,
    sd             = excluded.sd,
    cv             = excluded.cv,
    median         = excluded.median,
    window_days    = excluded.window_days,
    status         = excluded.status,
    computed_at    = excluded.computed_at;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

-- Recompute now so the decoupling baseline uses >= 18 s from today, not from tomorrow's 02:05 cron.
select public.refresh_stride_baselines();

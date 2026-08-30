-- Harden fn_impute_missing_rpe's existence check so Pass 2 can never double-fill.
--
-- The MD-day-aware version (20260830120000) correctly excludes `auto_fill` from the
-- BASELINE math (medians + team average) — a player's history should reflect real
-- effort, not Pass-1 team-average fills. But it also copied that exclusion into the
-- "who still needs imputing" existence check, which is wrong: Pass 1 (auto_fill) runs
-- first and blankets every missing player on a submitting team with the team average
-- (source='auto_fill', is_imputed=false). If Pass 2 then treats an auto_filled player
-- as "no RPE", a GPS-trained + auto_filled player gets a SECOND (imputed) row — the
-- partial unique index only guards duplicate imputed rows, not auto_fill+imputed.
--
-- Fix: the existence check skips anyone who already has ANY non-imputed row (real OR
-- auto_fill) — i.e. Pass 1 already covered them. Pass 2 still fills players Pass 1
-- skipped (no_baseline teams, or a GPS player with no row at all) and still RE-fills
-- existing imputed rows (is_imputed=true, so the check finds nothing → ON CONFLICT
-- updates). Baseline/team-average math is unchanged (still real submissions only).
-- Descriptive load continuity — never the readiness colour.

create or replace function public.fn_impute_missing_rpe(p_team_id uuid, p_date date)
 returns integer
 language plpgsql
 security definer
as $function$
declare
  v_count       integer := 0;
  v_team_avg    numeric;
  v_team_dur    integer;
  v_rec         record;
  v_player_rpe  numeric;
  v_player_dur  integer;
  v_md_tag      text;
  v_method      text;
begin
  v_md_tag := public.fn_md_tag(p_team_id, p_date);

  -- Team average RPE for this date — REAL submissions only (exclude the pass-1
  -- auto_fill team-average rows, which are is_imputed=false but not real effort).
  select round(avg(rpe)::numeric, 1), round(avg(duration_minutes)::numeric)::integer
  into v_team_avg, v_team_dur
  from session_rpe_entries
  where team_id = p_team_id
    and session_date = p_date
    and is_imputed = false
    and source is distinct from 'auto_fill';

  v_team_avg := coalesce(v_team_avg, 6.0);
  v_team_dur := coalesce(v_team_dur, 75);

  for v_rec in
    -- GPS-trained players Pass 1 did NOT already cover. A player is "covered" if
    -- they have any non-imputed row that day (a real submission OR a pass-1
    -- auto_fill) — skipping those is what prevents an auto_fill+imputed double row.
    select distinct el.player_id
    from player_external_load_daily el
    where el.team_id = p_team_id
      and el.date = p_date
      and el.source = 'catapult'
      and el.total_distance > 0
      and not exists (
        select 1 from session_rpe_entries sre
        where sre.player_id = el.player_id
          and sre.session_date = p_date
          and sre.is_imputed = false
      )
  loop
    v_player_rpe := null; v_player_dur := null; v_method := null;

    -- 1. SAME MD-TAG median — the player's own prior days of the same MD-tag
    --    (real submissions only), so a taper fills from tapers and a peak from peaks.
    if v_md_tag is not null then
      select
        round(percentile_cont(0.5) within group (order by rpe)::numeric, 1),
        round(percentile_cont(0.5) within group (order by duration_minutes)::numeric)::integer
      into v_player_rpe, v_player_dur
      from (
        select rpe, duration_minutes
        from session_rpe_entries s
        where s.player_id = v_rec.player_id
          and s.is_imputed = false
          and s.source is distinct from 'auto_fill'
          and s.session_date < p_date
          and s.session_date >= p_date - interval '70 days'
          and public.fn_md_tag(p_team_id, s.session_date) = v_md_tag
        order by s.session_date desc
        limit 6
      ) same_tag
      having count(*) >= 2;
      if v_player_rpe is not null then v_method := 'player_md_tag_median'; end if;
    end if;

    -- 2. Fallback: 10-day rolling median (real submissions only)
    if v_player_rpe is null then
      select
        round(percentile_cont(0.5) within group (order by rpe)::numeric, 1),
        round(percentile_cont(0.5) within group (order by duration_minutes)::numeric)::integer
      into v_player_rpe, v_player_dur
      from (
        select rpe, duration_minutes
        from session_rpe_entries
        where player_id = v_rec.player_id
          and is_imputed = false
          and source is distinct from 'auto_fill'
          and session_date < p_date
          and session_date >= p_date - interval '21 days'
        order by session_date desc
        limit 10
      ) recent
      having count(*) >= 3;
      if v_player_rpe is not null then v_method := 'player_rolling_10d_median'; end if;
    end if;

    -- 3. Final fallback: the day's real team average.
    insert into session_rpe_entries (
      player_id, team_id, session_date, session_type, session_name,
      duration_minutes, rpe, source, is_imputed, imputed_method
    ) values (
      v_rec.player_id, p_team_id, p_date, 'team_training', 'Auto-imputed',
      coalesce(v_player_dur, v_team_dur),
      coalesce(v_player_rpe, v_team_avg),
      'imputed', true,
      coalesce(v_method, 'team_session_average')
    )
    on conflict (player_id, session_date) where is_imputed = true
    do update set
      rpe              = excluded.rpe,
      duration_minutes = excluded.duration_minutes,
      imputed_method   = excluded.imputed_method;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

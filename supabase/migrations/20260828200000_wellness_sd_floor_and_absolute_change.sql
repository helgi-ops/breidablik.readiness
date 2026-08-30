-- Fix: low-variance responders flag red/yellow on sub-noise wellness dips.
--
-- A player who self-reports very consistently (tiny personal SD) gets a large
-- personal-norm z from a 1-2 point wobble on the 25-point total_score, so the
-- live colour (mp_apply_hybrid_readiness) and the PI tags (sustained-low) fire
-- on objectively-fine days. Example: Anton Logi (mean 20.83, SD 0.91) → 34% of
-- days red/yellow, all for scoring 19-20/25.
--
-- The fix mirrors the smallest-worthwhile-change discipline already used for
-- acute-drop (relative OR absolute) and CMJ/HRex (must clear BOTH a relative
-- AND an absolute threshold):
--   1. SD FLOOR — every personal-norm z divides by greatest(sd, 1.5), so a tight
--      norm can't manufacture a large z (applied in the colour engine AND in the
--      baseline_z the PI tags read).
--   2. ABSOLUTE-CHANGE FLOOR — the deviation RED/YELLOW bands and pi_sustained_low
--      additionally require a real points drop below the personal mean, not just a
--      z threshold.
-- Genuine drops still flag (a >=5-pt fall stays red — validated 50/50 on live
-- Breiðablik history; the only suppressed reds were 1-3 pt sub-noise).
--
-- Canonical colour contract is unchanged: same engine, same readiness_entries.color
-- / v_coach_readiness_today_v8.final_color — only less trigger-happy.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Colour engine — SD floor + absolute-points floor on the personal-z bands.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mp_apply_hybrid_readiness()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_total int;
  v_abs text;
  v_dev text;
  v_final text;
  v_z numeric;
  v_n int;
  v_mu numeric;
  v_delta_z numeric;
  v_conf text;
  v_baseline text;
  v_pi jsonb;
  v_low_count int;
  v_very_low_count int;
  v_override_note text;
  v_personal_override boolean;
  v_sten int;
  v_tscore int;

  -- Sub-noise floors (see migration header).
  v_sd_floor numeric := 1.5;      -- SD floor for total_score (~half a wellness question)
  t_dev_red_pts numeric := -3.0;  -- deviation RED needs >= 3 pts below personal mean
  t_dev_yellow_pts numeric := -2.0; -- deviation YELLOW needs >= 2 pts below personal mean
begin
  v_total :=
    coalesce(new.fatigue_energy,0)
  + coalesce(new.sleep_quality,0)
  + coalesce(new.sleep_duration,0)
  + coalesce(new.stress_mood,0)
  + coalesce(new.muscle_soreness,0);

  new.total_score := v_total;

  v_low_count :=
    (case when coalesce(new.fatigue_energy, 0)  <= 2 then 1 else 0 end)
  + (case when coalesce(new.sleep_quality, 0)   <= 2 then 1 else 0 end)
  + (case when coalesce(new.sleep_duration, 0)  <= 2 then 1 else 0 end)
  + (case when coalesce(new.stress_mood, 0)     <= 2 then 1 else 0 end)
  + (case when coalesce(new.muscle_soreness, 0) <= 2 then 1 else 0 end);

  v_very_low_count :=
    (case when coalesce(new.fatigue_energy, 0)  = 1 then 1 else 0 end)
  + (case when coalesce(new.sleep_quality, 0)   = 1 then 1 else 0 end)
  + (case when coalesce(new.sleep_duration, 0)  = 1 then 1 else 0 end)
  + (case when coalesce(new.stress_mood, 0)     = 1 then 1 else 0 end)
  + (case when coalesce(new.muscle_soreness, 0) = 1 then 1 else 0 end);

  v_override_note := null;
  v_personal_override := false;

  -- Absolute (global threshold) color — same as before
  if v_total >= 20 then
    v_abs := 'GREEN';
  elsif v_total >= 15 then
    v_abs := 'YELLOW';
  else
    if v_low_count = 1 and v_very_low_count = 0 and v_total >= 13 then
      v_abs := 'YELLOW';
      v_override_note := 'ABS gated: single low metric -> YELLOW (avoid false RED)';
    else
      v_abs := 'RED';
    end if;
  end if;

  -- Compute personal baseline (28d, excluding imputed)
  with hist as (
    select r.total_score
    from public.readiness_entries r
    where r.player_id = new.player_id
      and r.entry_date < new.entry_date
      and r.total_score is not null
      and r.entry_date >= (new.entry_date - interval '28 days')
      and coalesce(r.is_imputed, false) = false
    order by r.entry_date desc
    limit 60
  ),
  stats as (
    select
      count(*)::int as n,
      avg(total_score)::numeric as mu,
      stddev_samp(total_score)::numeric as sd
    from hist
  ),
  prev as (
    select r.entry_date, r.training_modifier
    from public.readiness_entries r
    where r.player_id = new.player_id
      and r.entry_date = (new.entry_date - interval '1 day')
    limit 1
  )
  select
    s.n,
    s.mu,
    -- SD FLOOR: divide by greatest(sd, floor) so a tight norm can't inflate z.
    case when s.sd is null then null else round((v_total - s.mu)/greatest(s.sd, v_sd_floor), 2) end as z,
    case
      when s.n < 10 then 'BUILDING'
      when s.n < 20 then 'STABILIZING'
      else 'STABLE'
    end as baseline,
    case
      when (p.training_modifier->'pi'->>'z') is null then null
      else round( ( (case when s.sd is null then null else (v_total - s.mu)/greatest(s.sd, v_sd_floor) end)
                  - (p.training_modifier->'pi'->>'z')::numeric ), 2)
    end as delta_z
  into v_n, v_mu, v_z, v_baseline, v_delta_z
  from stats s
  left join prev p on true;

  if v_z is null then
    v_sten := null;
    v_tscore := null;
  else
    v_sten := greatest(1, least(10, round((2 * v_z) + 5.5)::numeric))::int;
    v_tscore := round((10 * v_z) + 50)::int;
  end if;

  -- Deviation (personal z-score) color — now gated by BOTH the z band AND an
  -- absolute points drop below the personal mean (smallest-worthwhile-change).
  if coalesce(v_n,0) < 10 or v_z is null then
    v_dev := v_abs;
  else
    if v_z <= -1.0 and (v_total - v_mu) <= t_dev_red_pts then
      v_dev := 'RED';
    elsif v_z <= -0.3 and (v_total - v_mu) <= t_dev_yellow_pts then
      v_dev := 'YELLOW';
    elsif v_z >= 1.0 then
      v_dev := 'GREEN_PLUS';
    else
      v_dev := 'GREEN';
    end if;
  end if;

  -- ── personal-baseline-first final color ─────────────────────────
  if coalesce(v_n,0) < 14 or v_mu is null then
    -- Immature baseline: keep current hybrid behaviour (worst-wins)
    v_final :=
      case
        when upper(v_abs) = 'RED' or upper(v_dev) = 'RED' then 'RED'
        when upper(v_abs) = 'YELLOW' or upper(v_dev) = 'YELLOW' then 'YELLOW'
        when upper(v_abs) = 'GREEN_PLUS' and upper(v_dev) = 'GREEN_PLUS' then 'GREEN_PLUS'
        else 'GREEN'
      end;
  else
    -- Mature baseline: personal z-score is primary, with safety floors
    if v_total < 12 then
      v_final := 'RED';
      if v_override_note is null then
        v_override_note := format('Safety floor: total=%s < 12 -> RED', v_total);
      end if;
    elsif v_very_low_count >= 2 then
      v_final := 'RED';
      if v_override_note is null then
        v_override_note := format('Safety floor: %s sub-scores at 1 -> RED', v_very_low_count);
      end if;
    elsif upper(v_dev) = 'RED' then
      -- Personal z says RED — never suppressed
      v_final := 'RED';
    elsif v_mu < 16 and upper(v_abs) in ('YELLOW','RED') then
      -- Chronic-low personal norm (Tier C) — cap at YELLOW even if
      -- v_dev says GREEN.
      v_final := 'YELLOW';
      if v_override_note is null then
        v_override_note := format('Chronic-low cap: personal mean %s < 16 -> YELLOW', round(v_mu,1));
      end if;
    else
      -- Trust personal z-score (Robertson 2017)
      v_final := v_dev;
      if upper(v_abs) = 'YELLOW' and upper(v_dev) in ('GREEN','GREEN_PLUS') then
        v_personal_override := true;
        if v_override_note is null then
          v_override_note := format(
            'Personal baseline override: total=%s within norm (mean %s, z=%s) -> %s',
            v_total, round(v_mu,1), v_z, v_dev
          );
        end if;
      end if;
    end if;
  end if;

  -- Single-low-metric soft-RED gate (preserved from original logic)
  if v_final = 'RED' then
    if v_low_count = 1 and v_very_low_count = 0 and v_total >= 13 and (v_z is null or v_z > -1.0) then
      v_final := 'YELLOW';
      if v_override_note is null then
        v_override_note := 'Final gated: single low metric -> YELLOW (avoid false RED)';
      else
        v_override_note := v_override_note || ' | Final gated: single low metric -> YELLOW';
      end if;
    end if;
  end if;

  v_conf :=
    case
      when coalesce(v_n,0) >= 20 then 'HIGH'
      when coalesce(v_n,0) >= 10 then 'MEDIUM'
      else 'LOW'
    end;

  new.computed_auto_flag := v_final;

  new.training_action :=
    case v_final
      when 'RED' then 'RECOVERY'
      when 'YELLOW' then 'REDUCED'
      else 'FULL'
    end;

  new.color :=
    case v_final
      when 'RED' then 'red'
      when 'YELLOW' then 'yellow'
      else 'green'
    end;

  new.computed_auto_reason :=
    case
      when coalesce(v_n,0) < 14 then
        format('Immature baseline (n=%s, excl_imputed) — abs=%s, dev=%s, final=%s. low_count=%s',
               v_n, v_abs, v_dev, v_final, v_low_count)
      else
        format(
          'Personal-first: abs=%s, dev=%s, final=%s, z=%s, sten=%s, mean=%s, n=%s, low_count=%s, very_low=%s%s%s',
          v_abs, v_dev, v_final, v_z, coalesce(v_sten::text,'NA'),
          coalesce(round(v_mu,1)::text,'NA'), v_n, v_low_count, v_very_low_count,
          case when v_personal_override then ' [PERSONAL_OVERRIDE]' else '' end,
          case when v_override_note is null then '' else ' | ' || v_override_note end
        )
    end;

  v_pi := jsonb_build_object(
    'model', 'personal_first_v2',
    'abs', v_abs,
    'dev', v_dev,
    'final', v_final,
    'z', v_z,
    'sten', v_sten,
    'tscore', v_tscore,
    'n', v_n,
    'mu', v_mu,
    'delta_z', v_delta_z,
    'baseline', v_baseline,
    'confidence', v_conf,
    'total_score', v_total,
    'low_count', v_low_count,
    'very_low_count', v_very_low_count,
    'personal_override_applied', v_personal_override,
    'override_note', v_override_note,
    'sd_floor', v_sd_floor
  );

  new.training_modifier :=
    coalesce(new.training_modifier, '{}'::jsonb)
    || jsonb_build_object('pi', v_pi)
    || jsonb_build_object('confidence', v_conf)
    || jsonb_build_object('baseline', v_baseline);

  new.coach_message :=
    case
      when coalesce(v_n,0) < 14 then
        format('Baseline building (n=%s, excl_imputed). Using hybrid abs/dev today.', v_n)
      when v_personal_override then
        format('Personal baseline OK: total=%s, z=%s vs norm %s. Global=YELLOW but personal=%s.',
               v_total, v_z, round(v_mu,1), v_dev)
      else
        format('z=%s, STEN=%s, n=%s. Δz(vs í gær)=%s.',
               v_z, coalesce(v_sten::text,'NA'), v_n, coalesce(v_delta_z::text,'NA'))
    end;

  return new;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) baseline_z (fed to the PI tags) — floor the SD the same way, so the PI
--    engine's z-based rules can't over-fire on a tight norm either.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mp_set_baseline_z_before_pi()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  d record;
  v_sd_floor numeric := 1.5;
  v_zf numeric;
  v_lvl text;
begin
  if new.total_score is null then
    return new;
  end if;

  select *
  into d
  from public.mp_deviation_level(
    new.player_id,
    new.entry_date,
    new.total_score,
    28,   -- window_days
    7,    -- min_n
    0.10  -- sd_floor for the raw call; we re-floor z below
  );

  -- SD FLOOR (parity with the live colour engine): recompute z dividing by
  -- greatest(sd, 1.5) so a tight personal norm can't inflate the z the PI tags read.
  if coalesce(d.n, 0) < 7 or d.mean is null then
    v_zf := d.z;
    v_lvl := coalesce(d.level, 'BASELINE_BUILDING');
  else
    v_zf := round((new.total_score - d.mean) / greatest(coalesce(d.sd, 0), v_sd_floor), 2);
    v_lvl := case
      when v_zf >= 0.75 then 'GREEN_PLUS'
      when v_zf > -0.5 then 'GREEN'
      when v_zf > -1.0 then 'YELLOW'
      else 'RED'
    end;
  end if;

  new.training_modifier :=
    coalesce(new.training_modifier, '{}'::jsonb)
    || jsonb_build_object(
      'baseline_n', coalesce(d.n, 0),
      'baseline_z', v_zf,
      'baseline_mean', d.mean,
      'baseline_sd', d.sd,
      'baseline_sd_floor', v_sd_floor,
      'baseline_level', v_lvl
    );

  return new;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) PI tags — pi_sustained_low now also requires a real points drop below the
--    personal mean (absolute-change floor), mirroring the -4pt acute-drop floor.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mp_apply_performance_intelligence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_z numeric;
  v_n int;

  v_y record;
  v_y_z numeric;
  v_y_total int;

  v_last3_avg_z numeric;
  v_last3_avg_total numeric;
  v_baseline_mean numeric;
  v_last7_sd_total numeric;

  v_total int;
  v_abs text;

  v_tags text[] := array[]::text[];

  v_pi jsonb := '{}'::jsonb;
  v_coach text := '';
  v_player text := '';

  -- thresholds (tweakable)
  t_peak_z numeric := 1.25;        -- strong positive day
  t_drop_z numeric := -1.25;       -- acute drop threshold
  t_drop_delta_z numeric := -1.0;  -- acute drop vs yesterday
  t_drop_delta_pts int := -4;      -- acute drop in points
  t_sustain_avg_z numeric := -0.75;-- sustained low 3-day avg
  t_sustain_delta_pts numeric := -3; -- sustained low: 3-day avg must be >= 3 pts below personal mean
  t_vol_sd_total numeric := 2.5;   -- volatile total_score SD (last 7d)
begin
  v_z := nullif((new.training_modifier->>'baseline_z')::numeric, null);
  v_n := coalesce((new.training_modifier->>'baseline_n')::int, 0);
  v_baseline_mean := nullif(new.training_modifier->>'baseline_mean','')::numeric;

  v_total := coalesce(new.total_score, 0);
  v_abs := nullif(new.training_modifier->>'abs_level','');

  -- Yesterday (most recent prior entry)
  select
    (r.training_modifier->>'baseline_z')::numeric as z,
    r.total_score as total_score
  into v_y
  from public.readiness_entries r
  where r.player_id = new.player_id
    and r.entry_date < new.entry_date
    and r.total_score is not null
  order by r.entry_date desc
  limit 1;

  v_y_z := v_y.z;
  v_y_total := v_y.total_score;

  -- Last 3 days avg z (excluding today)
  select avg((r.training_modifier->>'baseline_z')::numeric)
  into v_last3_avg_z
  from public.readiness_entries r
  where r.player_id = new.player_id
    and r.entry_date < new.entry_date
    and r.entry_date >= (new.entry_date - interval '3 days')
    and (r.training_modifier ? 'baseline_z');

  -- Last 3 days avg total_score (excluding today) — for the absolute-change floor
  select avg(r.total_score)
  into v_last3_avg_total
  from public.readiness_entries r
  where r.player_id = new.player_id
    and r.entry_date < new.entry_date
    and r.entry_date >= (new.entry_date - interval '3 days')
    and r.total_score is not null;

  -- Last 7 days SD of total_score (excluding today)
  select stddev_samp(r.total_score)::numeric
  into v_last7_sd_total
  from public.readiness_entries r
  where r.player_id = new.player_id
    and r.entry_date < new.entry_date
    and r.entry_date >= (new.entry_date - interval '7 days')
    and r.total_score is not null;

  -- -----------------------------
  -- PI RULES
  -- -----------------------------

  -- 1) ACUTE DROP (z-based OR points-based) — unchanged; the z paths now read a
  --    SD-floored baseline_z so a tight norm no longer manufactures the drop.
  if v_n >= 7 then
    if v_z is not null then
      if v_z <= t_drop_z then
        if v_y_z is null or (v_y_z - v_z) >= abs(t_drop_delta_z) then
          v_tags := array_append(v_tags, 'pi_acute_drop');
        end if;
      end if;

      if v_y_z is not null and (v_z - v_y_z) <= t_drop_delta_z then
        v_tags := array_append(v_tags, 'pi_acute_drop');
      end if;
    end if;
  end if;

  if v_y_total is not null and (v_total - v_y_total) <= t_drop_delta_pts then
    if not ('pi_acute_drop' = any(v_tags)) then
      v_tags := array_append(v_tags, 'pi_acute_drop');
    end if;
  end if;

  -- 2) SUSTAINED LOW (3-day avg z) — now ALSO requires a real points drop below
  --    the personal mean, so a sub-1-point wobble can't read as sustained low.
  if v_n >= 10
     and v_last3_avg_z is not null and v_last3_avg_z <= t_sustain_avg_z
     and v_baseline_mean is not null and v_last3_avg_total is not null
     and (v_last3_avg_total - v_baseline_mean) <= t_sustain_delta_pts then
    v_tags := array_append(v_tags, 'pi_sustained_low');
  end if;

  -- 3) POSITIVE PEAK (today z high)
  if v_n >= 10 and v_z is not null and v_z >= t_peak_z then
    v_tags := array_append(v_tags, 'pi_positive_peak');
  end if;

  -- 4) VOLATILITY (7-day SD)
  if v_last7_sd_total is not null and v_last7_sd_total >= t_vol_sd_total then
    v_tags := array_append(v_tags, 'pi_volatility');
  end if;

  -- -----------------------------
  -- Apply tags -> flag_reason
  -- -----------------------------
  if new.flag_reason is null then
    new.flag_reason := array[]::text[];
  end if;

  if array_length(v_tags, 1) is not null then
    for i in 1..array_length(v_tags, 1) loop
      if not (v_tags[i] = any(new.flag_reason)) then
        new.flag_reason := array_append(new.flag_reason, v_tags[i]);
      end if;
    end loop;
  end if;

  -- -----------------------------
  -- Build PI JSON + messages
  -- -----------------------------
  v_pi := jsonb_build_object(
    'z_today', v_z,
    'baseline_n', v_n,
    'yesterday_z', v_y_z,
    'yesterday_total', v_y_total,
    'last3_avg_z', v_last3_avg_z,
    'last3_avg_total', v_last3_avg_total,
    'baseline_mean', v_baseline_mean,
    'last7_sd_total', v_last7_sd_total,
    'tags', to_jsonb(v_tags)
  );

  if 'pi_acute_drop' = any(v_tags) then
    v_coach := v_coach || 'PI: Acute drop. ';
  end if;

  if 'pi_sustained_low' = any(v_tags) then
    v_coach := v_coach || 'PI: Sustained low (3d). ';
  end if;

  if 'pi_positive_peak' = any(v_tags) then
    v_coach := v_coach || 'PI: Positive peak. ';
  end if;

  if 'pi_volatility' = any(v_tags) then
    v_coach := v_coach || 'PI: High volatility (7d). ';
  end if;

  if v_z is not null then
    v_coach := v_coach || 'z=' || round(v_z,2)::text || ', n=' || v_n::text || '. ';
  end if;

  if v_y_z is not null and v_z is not null then
    v_coach := v_coach || 'Δz(vs í gær)=' || round((v_z - v_y_z),2)::text || '. ';
  end if;

  if 'pi_acute_drop' = any(v_tags) then
    v_coach := v_coach || 'Tilmæli: minnka high-speed/plyo/þungar excentrics; fylgjast með verkjum + svefni.';
  elsif 'pi_sustained_low' = any(v_tags) then
    v_coach := v_coach || 'Tilmæli: 1–2 dagar reduced + recovery emphasis; athuga álag/streitu.';
  elsif 'pi_positive_peak' = any(v_tags) then
    v_coach := v_coach || 'Tilmæli: gott tækifæri fyrir gæði (hraði/kraftur) ef engin meiðslamerki.';
  end if;

  if array_length(v_tags, 1) is not null and array_length(v_tags, 1) > 0 then
    v_player := 'Í dag: ';
    if 'pi_acute_drop' = any(v_tags) then
      v_player := v_player || 'snögg breyting niður frá venjulegu. ';
    end if;
    if 'pi_sustained_low' = any(v_tags) then
      v_player := v_player || 'nokkrir dagar í röð aðeins neðar. ';
    end if;
    if 'pi_positive_peak' = any(v_tags) then
      v_player := v_player || 'mjög góður dagur miðað við þína línu. ';
    end if;
    v_player := v_player || 'Haltu áfram að skila check-in — það gerir áætlunina nákvæmari.';
  end if;

  if coalesce(v_coach,'') <> '' then
    new.coach_message := v_coach;
  end if;

  if coalesce(v_player,'') <> '' then
    new.player_explain := v_player;
  end if;

  new.training_modifier :=
    coalesce(new.training_modifier, '{}'::jsonb) ||
    jsonb_build_object('pi', v_pi);

  if 'pi_acute_drop' = any(v_tags) then
    if coalesce(new.training_action,'') = 'FULL' then
      new.training_action := 'REDUCED';
    end if;
  end if;

  return new;
end;
$function$;

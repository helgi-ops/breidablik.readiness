-- Fix: stop penalising low-check-in players with a permanent YELLOW.
--
-- Symptom (production): players with few real check-ins (e.g. Kristinn Narfi, ~8 load-days/month)
-- keep getting REDUCED on objectively-fine days. The REDUCED comes entirely from the morning
-- wellness colour being pulled YELLOW: their personal signal (dev) says GREEN — normal for them —
-- but the "immature baseline" branch is plain worst-wins, so an absolute-YELLOW (e.g. 19/20, one
-- question answered 3 instead of 4) dominates the GREEN personal verdict.
--
-- Root cause: the personal-baseline override (abs=YELLOW + dev∈{GREEN,GREEN_PLUS} → trust dev) only
-- ran at v_n >= 14 (14 real, non-imputed check-ins in 28 days). Low-load players accumulate many
-- off-day imputed rows and few real ones, so n(excl_imputed) never reaches 14 → trapped in
-- worst-wins indefinitely, even though a personal deviation signal (v_dev) is already computed at
-- v_n >= 10.
--
-- Fix 1 (this migration) — a SEMI-MATURE personal override at n in [10,13]:
-- when the personal deviation signal actually exists (v_n >= 10 so v_dev is computed, not copied
-- from v_abs) but the baseline is not yet fully mature (v_n < 14), allow the SAME override the
-- mature branch already uses, with ALL red safety floors preserved and two extra guards making this
-- tier strictly MORE conservative than the mature one:
--   * worst-wins is kept for RED here: v_abs='RED' OR v_dev='RED' → RED (the mature branch would
--     trust dev over an abs=RED; the semi-mature tier never does — it only ever moves YELLOW→GREEN).
--   * low_count = 0 guard: the flip is allowed only on a genuinely flat day (no sub-score ≤ 2), so a
--     day carrying a real low metric keeps its conservative YELLOW even if the personal z is GREEN.
-- Below v_n < 10 (no computable personal signal, e.g. a 7-check-in player) nothing changes — we do
-- NOT fabricate a personal verdict from too little data; that is honest.
--
-- Live validation over Breiðablik's last 180 real-entry days (reported in the PR):
--   23 active players sit in the n=10..13 band; 47 YELLOW→GREEN flips across 13 players, all on
--   total 18–19 "flat but fine" days (dev=GREEN, low_count=0, total ≥ 15). 0 flips on days with
--   low_count ≥ 1 or total < 15 (guarded out). 39 semi-mature abs=YELLOW/dev=RED days stay RED.
--
-- Canonical colour contract UNCHANGED (CLAUDE.md "Canonical verdict source"): same engine, same
-- readiness_entries.color / v_coach_readiness_today_v8.final_color — only less trigger-happy. No load
-- path is read or written; the REDUCED action is derived from the colour, so fixing the colour fixes
-- the session. All RED safety floors (total<12, very_low_count>=2, dev=RED, chronic-low mu<16 cap,
-- single-low soft-RED) are preserved. The absolute GREEN band (Fix 2 candidate) is deliberately NOT
-- changed here — it stays evidence-gated.

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

  -- Sub-noise floors (see 20260828200000 migration header).
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

  -- Absolute (global threshold) color — unchanged (Fix 2 candidate, not shipped here)
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

  -- Deviation (personal z-score) color — gated by BOTH the z band AND an absolute points
  -- drop below the personal mean (smallest-worthwhile-change). Computed once v_n >= 10.
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
  if coalesce(v_n,0) >= 14 and v_mu is not null then
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
      -- Chronic-low personal norm (Tier C) — cap at YELLOW even if v_dev says GREEN.
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
  elsif coalesce(v_n,0) >= 10 and v_z is not null and v_mu is not null then
    -- Semi-mature baseline (n 10..13): a personal deviation signal exists but the baseline is not
    -- yet fully mature. Apply the SAME override the mature branch uses, but strictly more
    -- conservatively — worst-wins is kept for RED, and the YELLOW→GREEN flip is allowed ONLY on a
    -- flat day (low_count = 0). All RED safety floors are preserved; this tier can only ever move
    -- an abs=YELLOW day to GREEN when the player's own computed norm says GREEN.
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
    elsif upper(v_abs) = 'RED' or upper(v_dev) = 'RED' then
      -- Worst-wins for RED in the semi-mature tier (never suppress a RED here).
      v_final := 'RED';
    elsif v_mu < 16 and upper(v_abs) in ('YELLOW','RED') then
      -- Chronic-low personal norm — cap at YELLOW even if v_dev says GREEN.
      v_final := 'YELLOW';
      if v_override_note is null then
        v_override_note := format('Chronic-low cap: personal mean %s < 16 -> YELLOW', round(v_mu,1));
      end if;
    elsif upper(v_abs) = 'YELLOW' and upper(v_dev) in ('GREEN','GREEN_PLUS') and v_low_count = 0 then
      -- The fix: trust the personal verdict on a flat-but-fine day for a semi-mature baseline.
      v_final := v_dev;
      v_personal_override := true;
      if v_override_note is null then
        v_override_note := format(
          'Semi-mature personal override (n=%s): total=%s within norm (mean %s, z=%s), no low metric -> %s',
          v_n, v_total, round(v_mu,1), v_z, v_dev
        );
      end if;
    else
      -- Everything else in this tier keeps the original worst-wins behaviour.
      v_final :=
        case
          when upper(v_abs) = 'YELLOW' or upper(v_dev) = 'YELLOW' then 'YELLOW'
          when upper(v_abs) = 'GREEN_PLUS' and upper(v_dev) = 'GREEN_PLUS' then 'GREEN_PLUS'
          else 'GREEN'
        end;
    end if;
  else
    -- Truly immature baseline (n < 10, or no computable personal z): keep worst-wins (unchanged).
    v_final :=
      case
        when upper(v_abs) = 'RED' or upper(v_dev) = 'RED' then 'RED'
        when upper(v_abs) = 'YELLOW' or upper(v_dev) = 'YELLOW' then 'YELLOW'
        when upper(v_abs) = 'GREEN_PLUS' and upper(v_dev) = 'GREEN_PLUS' then 'GREEN_PLUS'
        else 'GREEN'
      end;
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
      when coalesce(v_n,0) >= 14 then
        format(
          'Personal-first: abs=%s, dev=%s, final=%s, z=%s, sten=%s, mean=%s, n=%s, low_count=%s, very_low=%s%s%s',
          v_abs, v_dev, v_final, v_z, coalesce(v_sten::text,'NA'),
          coalesce(round(v_mu,1)::text,'NA'), v_n, v_low_count, v_very_low_count,
          case when v_personal_override then ' [PERSONAL_OVERRIDE]' else '' end,
          case when v_override_note is null then '' else ' | ' || v_override_note end
        )
      when coalesce(v_n,0) >= 10 and v_z is not null then
        format(
          'Semi-mature (n=%s, excl_imputed): abs=%s, dev=%s, final=%s, z=%s, mean=%s, low_count=%s, very_low=%s%s%s',
          v_n, v_abs, v_dev, v_final, v_z,
          coalesce(round(v_mu,1)::text,'NA'), v_low_count, v_very_low_count,
          case when v_personal_override then ' [PERSONAL_OVERRIDE]' else '' end,
          case when v_override_note is null then '' else ' | ' || v_override_note end
        )
      else
        format('Immature baseline (n=%s, excl_imputed) — abs=%s, dev=%s, final=%s. low_count=%s',
               v_n, v_abs, v_dev, v_final, v_low_count)
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
      when v_personal_override then
        format('Personal baseline OK: total=%s, z=%s vs norm %s. Global=YELLOW but personal=%s.',
               v_total, v_z, round(v_mu,1), v_dev)
      when coalesce(v_n,0) < 14 then
        format('Baseline building (n=%s, excl_imputed). Using hybrid abs/dev today.', v_n)
      else
        format('z=%s, STEN=%s, n=%s. Δz(vs í gær)=%s.',
               v_z, coalesce(v_sten::text,'NA'), v_n, coalesce(v_delta_z::text,'NA'))
    end;

  return new;
end;
$function$;

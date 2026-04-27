-- Personal-baseline-first readiness coloring (Robertson 2017)
--
-- Replaces the previous "WORST of (v_abs, v_dev)" hybrid in
-- mp_apply_hybrid_readiness with a model that trusts the player's
-- personal z-score once their 28-day baseline is mature (n ≥ 14).
-- Solves the chronic-yellow trap where players whose personal mean
-- sits inside the global YELLOW band (12-19) could never reach GREEN
-- even on a perfectly normal day for them.
--
-- Concrete example (production data 2026-04-26):
--   Höskuldur Gunnlaugsson — personal mean 18.29 / sd 1.07 (n=14)
--   Reports total=18 (his typical day, z=-0.27)
--   Old: v_abs=YELLOW, v_dev=GREEN, v_final=YELLOW (always)
--   New: n=14, mean=18.29 ≥ 16, v_dev=GREEN → v_final=GREEN
--
-- Backfill audit (632 entries over 28d):
--   59 yellow → green   (false-yellow trap fixed)
--    2 yellow → red     (hidden personal-z RED was being suppressed)
--    3 green  → yellow  (hidden personal drops above global green floor)
--   568 unchanged
--
-- Safety floors preserved:
--   1. total < 12         → force RED (truly low absolute)
--   2. very_low_count ≥ 2 → force RED (multiple sub-scores at 1)
--   3. v_dev = RED        → RED (personal z escalation never suppressed)
--   4. mean < 16          → cap at YELLOW (Tier C chronic-low — don't
--                           auto-green a player whose personal norm is
--                           itself in the global yellow band)
--
-- Immature baselines (n < 14) keep the existing hybrid worst-wins
-- behaviour so new players don't get personalised before there's enough
-- data to trust.

create or replace function public.mp_apply_hybrid_readiness()
returns trigger
language plpgsql
as $func$
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
    case when s.sd is null or s.sd = 0 then null else round((v_total - s.mu)/s.sd, 2) end as z,
    case
      when s.n < 10 then 'BUILDING'
      when s.n < 20 then 'STABILIZING'
      else 'STABLE'
    end as baseline,
    case
      when (p.training_modifier->'pi'->>'z') is null then null
      else round( ( (case when s.sd is null or s.sd = 0 then null else (v_total - s.mu)/s.sd end)
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

  -- Deviation (personal z-score) color
  if coalesce(v_n,0) < 10 or v_z is null then
    v_dev := v_abs;
  else
    if v_z <= -1.0 then
      v_dev := 'RED';
    elsif v_z <= -0.3 then
      v_dev := 'YELLOW';
    elsif v_z >= 1.0 then
      v_dev := 'GREEN_PLUS';
    else
      v_dev := 'GREEN';
    end if;
  end if;

  -- ── Personal-baseline-first final color (Robertson 2017) ────────
  -- Replaces the old "WORST of (v_abs, v_dev)" with a model that
  -- trusts personal z-score when baseline is mature (n ≥ 14) and
  -- the player's personal mean is itself healthy (≥ 16). Safety
  -- floors preserved for clinically-low absolute totals.
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
      -- v_dev says GREEN. Don't auto-green a player whose long-term
      -- baseline is itself in the danger zone.
      v_final := 'YELLOW';
      if v_override_note is null then
        v_override_note := format('Chronic-low cap: personal mean %s < 16 -> YELLOW', round(v_mu,1));
      end if;
    else
      -- Trust personal z-score (Robertson 2017)
      v_final := v_dev;
      -- Mark when this overrides global YELLOW so the coach UI can
      -- surface "Personal baseline override" context if helpful.
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
    'override_note', v_override_note
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
$func$;

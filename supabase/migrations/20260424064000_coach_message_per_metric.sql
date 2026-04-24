-- C: Auto-write per-metric coach_message via trigger.
--
-- Replaces the simple absolute-threshold notes in mp_set_coach_message with
-- per-athlete SD-band reasoning. Reads from athlete_metric_baselines (the
-- nightly per-athlete baselines table) to identify *which* of the 5 wellness
-- metrics drove today's flag, and how far it drifted from the player's own
-- 28-day baseline.
--
-- The result is a clear, specific Icelandic-language explanation in
-- coach_message that replaces the previous generic text. Examples:
--
--   "RED — orka/úthald 3.5 SD undir hans venjulegu (1 vs 4.0). Aðrar
--    mælingar eðlilegar. Sennilega illness/svefntruflun, ekki yfirálag."
--
--   "RED — svefngæði 4 SD undir baseline (3 vs 4.6). Bráð svefnvandi.
--    Recovery focus í dag."
--
--   "YELLOW — heildin fín (22/25), en svefnlengd eitt og sér 4.4 SD undir
--    baseline. Mögulega einn slæmur dagur — vert að spyrja."
--
-- Falls back to absolute-threshold notes (existing behaviour) when the
-- player has insufficient_data baseline status (new clubs / first 7 days).
--
-- Also writes a structured dominant_signal JSONB into training_modifier.pi
-- so future UI components can render badges/icons without re-computing.
--
-- Bug fix: the previous function checked `muscle_soreness >= 4` to surface
-- "Mikil stífleiki/eymsli", but the scale is 5 = best (no soreness),
-- 1 = worst (very sore) per mp_apply_hybrid_readiness. Inverted threshold.
-- New version uses ≤2 like the other low-is-bad fields.

create or replace function public.mp_set_coach_message()
returns trigger
language plpgsql
as $$
declare
  v_flag text;
  v_total int;
  v_msg text;
  v_metric record;

  -- Per-metric tracking
  v_dom_metric  text;        -- wellness.* key of worst signal
  v_dom_label   text;        -- Icelandic label
  v_dom_z       numeric;
  v_dom_value   numeric;
  v_dom_mean    numeric;
  v_n_concerning int := 0;   -- count of metrics with z ≤ -1.5
  v_n_extreme    int := 0;   -- count of metrics with z ≤ -2.5
  v_baseline_status text;
  v_dominant_jsonb jsonb;
begin
  -- Manual override: if a coach already typed a message, don't overwrite
  if nullif(trim(coalesce(new.coach_message, '')), '') is not null then
    return new;
  end if;

  v_flag  := upper(coalesce(new.computed_auto_flag, ''));
  v_total := coalesce(new.total_score, 0);

  -- Walk the 5 granular wellness metrics, compute z-score for each against
  -- this player's personal baseline. Track the most-concerning (most-negative
  -- z; lower = worse for all 5 metrics) and count broad-crash indicators.
  for v_metric in
    select * from (values
      ('wellness.fatigue_energy',  'orka/úthald',     new.fatigue_energy::numeric),
      ('wellness.sleep_quality',   'svefngæði',       new.sleep_quality::numeric),
      ('wellness.sleep_duration',  'svefnlengd',      new.sleep_duration::numeric),
      ('wellness.stress_mood',     'andleg líðan',    new.stress_mood::numeric),
      ('wellness.muscle_soreness', 'stífleiki/eymsli',new.muscle_soreness::numeric)
    ) as t(metric_key, label, today_value)
  loop
    declare
      b_mean numeric;
      b_sd   numeric;
      b_status text;
      z      numeric;
    begin
      if v_metric.today_value is null then
        continue;
      end if;

      select mean, sd, status
        into b_mean, b_sd, b_status
      from public.athlete_metric_baselines
      where player_id = new.player_id
        and metric_key = v_metric.metric_key;

      -- No usable baseline → skip this metric
      if b_mean is null or b_sd is null or b_sd = 0
         or b_status = 'insufficient_data' then
        continue;
      end if;

      -- Track the most-active baseline status across the 5 metrics
      -- (used to decide between SD-band messaging vs. absolute fallback)
      if v_baseline_status is null
         or (v_baseline_status = 'calibrating' and b_status = 'active') then
        v_baseline_status := b_status;
      end if;

      z := round((v_metric.today_value - b_mean) / b_sd, 2);

      -- Track new dominant (most-negative z)
      if v_dom_z is null or z < v_dom_z then
        v_dom_z      := z;
        v_dom_metric := v_metric.metric_key;
        v_dom_label  := v_metric.label;
        v_dom_value  := v_metric.today_value;
        v_dom_mean   := round(b_mean, 1);
      end if;

      if z <= -1.5 then
        v_n_concerning := v_n_concerning + 1;
      end if;
      if z <= -2.5 then
        v_n_extreme := v_n_extreme + 1;
      end if;
    end;
  end loop;

  -- ─── Build the message ──────────────────────────────────────────────
  if v_dom_z is not null and v_baseline_status in ('active','calibrating') then
    -- We have at least one usable per-metric baseline → SD-band messaging
    if v_n_concerning >= 3 then
      -- Broad crash across multiple metrics
      v_msg := format(
        '%s — %s mælingar samtímis undir baseline. %s er dýpst (%s SD undir, %s vs %s). Almennt yfirálag/illness merki — recovery dagur.',
        v_flag, v_n_concerning, v_dom_label, abs(v_dom_z), v_dom_value, v_dom_mean
      );
    elsif v_dom_z <= -2.0 then
      -- Single-metric extreme drop
      if v_flag = 'YELLOW' and v_total >= 20 then
        v_msg := format(
          '%s — heildin fín (%s/25), en %s eitt og sér %s SD undir baseline (%s vs %s). Mögulega einn slæmur dagur — vert að spyrja.',
          v_flag, v_total, v_dom_label, abs(v_dom_z), v_dom_value, v_dom_mean
        );
      else
        v_msg := format(
          '%s — %s %s SD undir hans venjulegu (%s vs %s). Aðrar mælingar eðlilegar. %s',
          v_flag, v_dom_label, abs(v_dom_z), v_dom_value, v_dom_mean,
          case
            when v_dom_metric = 'wellness.fatigue_energy'  then 'Sennilega illness eða svefntruflun, ekki yfirálag.'
            when v_dom_metric = 'wellness.sleep_quality'   then 'Bráð svefnvandi. Recovery focus í dag.'
            when v_dom_metric = 'wellness.sleep_duration'  then 'Stuttur svefn — minnka tæknilegt álag, halda magni.'
            when v_dom_metric = 'wellness.stress_mood'     then 'Andlegt álag — léttari session, samtal við þjálfara.'
            when v_dom_metric = 'wellness.muscle_soreness' then 'Líkamleg eymsli — recovery focus, skoða álagsstaði.'
            else ''
          end
        );
      end if;
    elsif v_dom_z <= -1.0 and v_flag in ('YELLOW','RED') then
      -- Mild drift, used as supporting context
      v_msg := format(
        '%s — %s aðeins undir baseline (%s SD, %s vs %s).%s',
        v_flag, v_dom_label, abs(v_dom_z), v_dom_value, v_dom_mean,
        case v_flag
          when 'RED' then ' Recovery dagur.'
          when 'YELLOW' then ' Minnkaðu magn ~20–30%.'
          else ''
        end
      );
    else
      -- No per-metric drift but flag exists — keep generic
      v_msg := case v_flag
        when 'RED' then 'RED — Recovery day. Haltu því mjög léttu.'
        when 'YELLOW' then 'YELLOW — Reduced day. Minnkaðu magn/álag ~20–30%.'
        when 'GREEN_PLUS' then 'GREEN+ — Vel hvíldur, fullt session með möguleika á aukálagi.'
        else 'GREEN — Full session.'
      end;
    end if;

  else
    -- Insufficient baseline (new club / first 7 days) → fallback to
    -- absolute-threshold messaging (the original logic, with bug fixed).
    v_msg := case v_flag
      when 'RED' then 'RED — Recovery day. Haltu því mjög léttu.'
      when 'YELLOW' then 'YELLOW — Reduced day. Minnkaðu magn/álag ~20–30%.'
      when 'GREEN_PLUS' then 'GREEN+ — Vel hvíldur.'
      else 'GREEN — Full session.'
    end;

    if new.fatigue_energy   is not null and new.fatigue_energy   <= 2 then v_msg := v_msg || ' Lág orka.'; end if;
    if new.sleep_quality    is not null and new.sleep_quality    <= 2 then v_msg := v_msg || ' Lág svefngæði.'; end if;
    if new.sleep_duration   is not null and new.sleep_duration   <= 2 then v_msg := v_msg || ' Stuttur svefn.'; end if;
    if new.stress_mood      is not null and new.stress_mood      <= 2 then v_msg := v_msg || ' Andlegt álag.'; end if;
    if new.muscle_soreness  is not null and new.muscle_soreness  <= 2 then v_msg := v_msg || ' Mikil stífleiki/eymsli.'; end if;

    if v_baseline_status = 'calibrating' then
      v_msg := v_msg || ' (Baseline að byggjast upp.)';
    end if;
  end if;

  -- Store structured dominant_signal in training_modifier.pi for future UI
  if v_dom_metric is not null then
    v_dominant_jsonb := jsonb_build_object(
      'metric',     v_dom_metric,
      'label',      v_dom_label,
      'z',          v_dom_z,
      'value',      v_dom_value,
      'baseline',   v_dom_mean,
      'n_concerning', v_n_concerning,
      'n_extreme',    v_n_extreme,
      'baseline_status', v_baseline_status
    );
    new.training_modifier := coalesce(new.training_modifier, '{}'::jsonb)
      || jsonb_build_object('pi',
           coalesce(new.training_modifier->'pi', '{}'::jsonb)
           || jsonb_build_object('dominant_signal', v_dominant_jsonb)
         );
  end if;

  new.coach_message := nullif(trim(v_msg), '');
  return new;
end;
$$;

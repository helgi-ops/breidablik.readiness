-- Stage 5 of MicroPulse Lite Mode rollout: replace heuristic-only tier
-- detection with an explicit declared plan. Heuristic still runs as a
-- fallback when plan is 'unknown', but declared plan now wins over data
-- so a Lite team can't accidentally auto-promote to FULL when bogus
-- B2-3 data flows in (the bug that caused the Afturedling fiasco).
--
-- Resolution priority for get_catapult_data_tier(team_id):
--   1. catapult_data_tier_override ('lite' | 'full') — admin escape hatch
--   2. catapult_plan_type ('lite' | 'pro' | 'premium') — declared plan
--   3. Heuristic on player_external_load_daily B2-3 row count (legacy)
--   4. Default 'lite' (conservative)

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS catapult_plan_type text
    NOT NULL DEFAULT 'unknown'
    CHECK (catapult_plan_type IN ('unknown', 'lite', 'pro', 'premium'));

COMMENT ON COLUMN public.teams.catapult_plan_type IS
  'Declared Catapult subscription tier. lite=standard reports only, pro=adds B2-3 Gen 2, premium=adds IMA Free Running + MPE, unknown=heuristic fallback.';

CREATE OR REPLACE FUNCTION public.get_catapult_data_tier(p_team_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_override   text;
  v_plan       text;
  v_b23_count  int;
BEGIN
  SELECT catapult_data_tier_override, catapult_plan_type
    INTO v_override, v_plan
    FROM teams WHERE id = p_team_id;

  -- 1. Hard override always wins
  IF v_override IN ('lite', 'full') THEN RETURN v_override; END IF;

  -- 2. Declared plan
  IF v_plan = 'lite' THEN RETURN 'lite'; END IF;
  IF v_plan IN ('pro', 'premium') THEN RETURN 'full'; END IF;

  -- 3. Heuristic fallback — only fires when plan is 'unknown'
  SELECT COUNT(*)
    INTO v_b23_count
    FROM player_external_load_daily
   WHERE team_id = p_team_id
     AND date >= CURRENT_DATE - INTERVAL '30 days'
     AND ((accel_b2_3_tot_effs_gen2 IS NOT NULL AND accel_b2_3_tot_effs_gen2 > 0)
       OR (decel_b2_3_tot_effs_gen2 IS NOT NULL AND decel_b2_3_tot_effs_gen2 > 0));

  -- 4. Default conservative
  IF v_b23_count >= 5 THEN RETURN 'full'; ELSE RETURN 'lite'; END IF;
END;
$$;

COMMENT ON FUNCTION public.get_catapult_data_tier(uuid) IS
  'Returns the active Catapult data tier for a team. Resolution chain: 1) hard override 2) declared plan_type 3) B2-3 row heuristic 4) default lite.';

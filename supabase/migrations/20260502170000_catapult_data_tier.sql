-- MicroPulse "Lite Mode" — auto-detect Catapult data tier per team.
--
-- Background: clubs on lower-tier Catapult contracts (e.g. Afturelding)
-- don't get Acceleration/Deceleration Band 2-3 efforts in their reporting
-- params — only B1+ aggregate. McBurnie Decel Intelligence,
-- Indoor Load IMA bands, and Quadrant View can't be computed without
-- B2-3 + IMA Band 3 — they show empty data and erode coach trust.
--
-- This migration:
--   1. Adds teams.catapult_data_tier_override (auto | full | lite)
--      so admins can pin a tier when needed (e.g. brand new team
--      where data hasn't arrived yet but we know they're FULL).
--   2. Adds public.get_catapult_data_tier(team_id) which:
--        - returns the override if set to 'full' or 'lite'
--        - otherwise auto-detects from player_external_load_daily:
--            ≥ 5 rows in last 30d with B2-3 populated → 'full'
--            else → 'lite' (conservative — show fewer features when
--            uncertain, gracefully promote when data arrives)
--   3. Defaults every existing team to 'auto'.

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS catapult_data_tier_override text NOT NULL DEFAULT 'auto'
    CHECK (catapult_data_tier_override IN ('auto', 'full', 'lite'));

COMMENT ON COLUMN public.teams.catapult_data_tier_override IS
  'Manual tier override for Catapult data access. ''auto'' lets get_catapult_data_tier() infer from player_external_load_daily B2-3 presence; ''full''/''lite'' force a tier regardless of data.';

CREATE OR REPLACE FUNCTION public.get_catapult_data_tier(p_team_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $func$
DECLARE
  v_override   text;
  v_b23_rows   int;
  v_total_rows int;
BEGIN
  SELECT catapult_data_tier_override INTO v_override
  FROM public.teams
  WHERE id = p_team_id;

  -- Honor explicit overrides without touching data.
  IF v_override = 'full' OR v_override = 'lite' THEN
    RETURN v_override;
  END IF;

  -- Auto-detect from last 30 days of external load data.
  SELECT
    COUNT(*) FILTER (WHERE accel_b2_3_tot_effs_gen2 IS NOT NULL AND accel_b2_3_tot_effs_gen2 > 0
                       OR  decel_b2_3_tot_effs_gen2 IS NOT NULL AND decel_b2_3_tot_effs_gen2 > 0),
    COUNT(*)
  INTO v_b23_rows, v_total_rows
  FROM public.player_external_load_daily
  WHERE team_id = p_team_id
    AND date >= current_date - 30;

  -- Need at least 5 rows of B2-3 presence to call it FULL. Otherwise
  -- LITE — safer to under-promise than to surface broken features.
  IF v_b23_rows >= 5 THEN
    RETURN 'full';
  ELSE
    RETURN 'lite';
  END IF;
END;
$func$;

COMMENT ON FUNCTION public.get_catapult_data_tier(uuid) IS
  'Returns the Catapult data tier for a team: ''full'' (has B2-3 efforts) or ''lite'' (basic params only). Honors teams.catapult_data_tier_override when explicitly set.';

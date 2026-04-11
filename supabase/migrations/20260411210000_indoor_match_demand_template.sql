-- Merge indoor FMP/IMA KPI defaults into existing team_load_targets rows.
--
-- Adds default percentages for indoor keys (fmpDynamicHigh, fmpDynamicMedium,
-- fmpRunningHigh, imaTotal) into each MD-day row of match_demand_template,
-- without touching the existing outdoor percentages a coach may have tuned.
--
-- Runtime code also merges defaults at load time (mergeTemplateWithDefaults),
-- so this migration is primarily a convenience so selects return the full
-- template as-is for teams upgraded in place.

DO $$
DECLARE
  indoor_defaults jsonb := jsonb_build_object(
    'MD-5', jsonb_build_object(
      'fmpDynamicHigh', 0.70,
      'fmpDynamicMedium', 0.85,
      'fmpRunningHigh', 0.75,
      'imaTotal', 0.90
    ),
    'MD-4', jsonb_build_object(
      'fmpDynamicHigh', 1.00,
      'fmpDynamicMedium', 1.05,
      'fmpRunningHigh', 1.05,
      'imaTotal', 1.10
    ),
    'MD-3', jsonb_build_object(
      'fmpDynamicHigh', 0.80,
      'fmpDynamicMedium', 0.90,
      'fmpRunningHigh', 0.90,
      'imaTotal', 0.90
    ),
    'MD-2', jsonb_build_object(
      'fmpDynamicHigh', 0.50,
      'fmpDynamicMedium', 0.65,
      'fmpRunningHigh', 0.55,
      'imaTotal', 0.60
    ),
    'MD-1', jsonb_build_object(
      'fmpDynamicHigh', 0.30,
      'fmpDynamicMedium', 0.40,
      'fmpRunningHigh', 0.35,
      'imaTotal', 0.40
    ),
    'MD+1', jsonb_build_object(
      'fmpDynamicHigh', 0.15,
      'fmpDynamicMedium', 0.30,
      'fmpRunningHigh', 0.20,
      'imaTotal', 0.30
    ),
    'MD', jsonb_build_object(
      'fmpDynamicHigh', 1.00,
      'fmpDynamicMedium', 1.00,
      'fmpRunningHigh', 1.00,
      'imaTotal', 1.00
    )
  );
BEGIN
  UPDATE public.team_load_targets t
  SET match_demand_template = (
    SELECT jsonb_object_agg(
      day_key,
      -- indoor defaults first, then existing values override (preserves coach tuning)
      COALESCE(indoor_defaults -> day_key, '{}'::jsonb)
        || COALESCE(t.match_demand_template -> day_key, '{}'::jsonb)
    )
    FROM (
      SELECT unnest(ARRAY['MD-5','MD-4','MD-3','MD-2','MD-1','MD','MD+1']) AS day_key
    ) AS days
  )
  WHERE t.match_demand_template IS NOT NULL;
END $$;

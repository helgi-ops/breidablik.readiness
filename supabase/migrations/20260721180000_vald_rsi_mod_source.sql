-- RSI-modified provenance on CMJ results. RSI-mod is the most fatigue-sensitive
-- CMJ metric (Marques & Buchheit 2026; Gathercole 2015), but VALD is not sending
-- it yet (0/731 rows). When a future payload carries jump height + time-to-takeoff
-- but no precomputed RSI-mod, the normalizer derives it (jump_height ÷ time-to-
-- takeoff). This column records whether the stored value came straight from VALD
-- or was derived, so a derived number is never mistaken for a native measurement.
--   NULL   = no RSI-mod stored (VALD isn't sending it and it can't be derived)
--   'vald' = VALD provided RSI-modified directly
--   'derived' = computed from jump height + time-to-takeoff

ALTER TABLE public.vald_forcedecks_results
  ADD COLUMN IF NOT EXISTS rsi_mod_source text
  CHECK (rsi_mod_source IN ('vald', 'derived'));

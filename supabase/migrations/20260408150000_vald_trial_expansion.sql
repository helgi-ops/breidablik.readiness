-- Expand VALD ForceDecks results to store individual trials (not just best-per-test).
-- Each CMJ test session contains multiple trials (typically 3). Previously only the
-- best trial was stored. This migration adds trial_number so every trial is persisted,
-- giving the 42-day baseline 3× more data points and enabling per-trial display.

-- 1. Add trial_number column (default 1 for existing single-trial rows)
ALTER TABLE public.vald_forcedecks_results
  ADD COLUMN IF NOT EXISTS trial_number smallint NOT NULL DEFAULT 1;

-- 2. Drop old unique constraints on raw_test_id alone (both naming conventions),
--    then create the correct compound unique constraint.
ALTER TABLE public.vald_forcedecks_results
  DROP CONSTRAINT IF EXISTS uq_vald_forcedecks_raw_test_id;
ALTER TABLE public.vald_forcedecks_results
  DROP CONSTRAINT IF EXISTS vald_forcedecks_results_raw_test_id_key;

-- Compound unique: one row per trial per raw test
ALTER TABLE public.vald_forcedecks_results
  ADD CONSTRAINT uq_vald_forcedecks_raw_test_trial
  UNIQUE (raw_test_id, trial_number);

-- 3. Index for fast baseline lookups (team + player + date range)
CREATE INDEX IF NOT EXISTS idx_vald_fd_baseline_lookup
  ON public.vald_forcedecks_results (team_id, microplayer_id, test_timestamp DESC)
  WHERE is_valid = true;

-- 4. Same treatment for nordbord and forceframe (future-proofing)
ALTER TABLE public.vald_nordbord_results
  ADD COLUMN IF NOT EXISTS trial_number smallint NOT NULL DEFAULT 1;

ALTER TABLE public.vald_nordbord_results
  DROP CONSTRAINT IF EXISTS uq_vald_nordbord_raw_test_id;
ALTER TABLE public.vald_nordbord_results
  DROP CONSTRAINT IF EXISTS vald_nordbord_results_raw_test_id_key;

ALTER TABLE public.vald_nordbord_results
  ADD CONSTRAINT uq_vald_nordbord_raw_test_trial
  UNIQUE (raw_test_id, trial_number);

ALTER TABLE public.vald_forceframe_results
  ADD COLUMN IF NOT EXISTS trial_number smallint NOT NULL DEFAULT 1;

ALTER TABLE public.vald_forceframe_results
  DROP CONSTRAINT IF EXISTS uq_vald_forceframe_raw_test_id;
ALTER TABLE public.vald_forceframe_results
  DROP CONSTRAINT IF EXISTS vald_forceframe_results_raw_test_id_key;

ALTER TABLE public.vald_forceframe_results
  ADD CONSTRAINT uq_vald_forceframe_raw_test_trial
  UNIQUE (raw_test_id, trial_number);

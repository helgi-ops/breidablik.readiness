-- IMA Clock (Gen2) directional movement signature. Catapult expresses the
-- DIRECTION of each inertial event as a clock position (1-12 o'clock) at three
-- intensities (high/medium/low). Stored as one JSONB grid rather than 36 flat
-- columns: { "1": {"high":n,"medium":n,"low":n}, ... "12": {...} }.
-- This is the high-resolution Driver-layer signal (directional movement
-- fingerprint) that powers the next phase of Unfamiliar Load. Populated once
-- the IMA O'Clock parameters are enabled in the Catapult export.
alter table public.player_external_load_daily
  add column if not exists ima_clock_gen2 jsonb;

comment on column public.player_external_load_daily.ima_clock_gen2 is
  'IMA directional movement grid (Gen2): 12 clock directions x {high,medium,low} event counts, as JSONB. Driver-layer movement fingerprint (Unfamiliar Load).';

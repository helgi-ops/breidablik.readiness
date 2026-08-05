-- Additive, nullable CMJ force-time columns for item-4 metric refinements.
-- rfd_n_s: early/windowed rate of force development (N/s), captured from VALD when
--   available (D'Emanuele 2021; Maffiuletti). NULL until a sync populates it →
--   honest empty state, never treated as zero.
-- flight_time_ms: measured flight time (ms) for a directly-measured FT:CT ratio
--   (Edwards 2018). Until populated, FT:CT is derived from the measured jump height.
ALTER TABLE vald_forcedecks_results
  ADD COLUMN IF NOT EXISTS rfd_n_s numeric,
  ADD COLUMN IF NOT EXISTS flight_time_ms numeric;

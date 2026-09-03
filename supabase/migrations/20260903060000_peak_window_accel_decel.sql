-- Per-peak-window accel / decel counts. The MII peak-window feed carried only Distance +
-- Player Load; once the club enables the IMA Accel/Decel MII interval params in OpenField,
-- their peak windows land here (one row per metric, count in the matching column — the metric
-- is implicit from which value column is non-null, matching distance_m / player_load).
-- Descriptive load context — nothing here reads or writes readiness_entries.color.
alter table public.player_peak_window
  add column if not exists ima_accel numeric,
  add column if not exists ima_decel numeric;

-- More IMA (inertial) detail per drill. Catapult already returns these per OpenField period;
-- until now only five IMA totals were kept. Inertial counts are real indoors (no satellite lock),
-- so an indoor team (HK) gets movement numbers on its drills when it syncs.
--
-- player_drill_load: per player per drill (raw period sums).
-- drill_library: the drill's calibrated per-player profile, plus where it was measured.
-- Additive only: nullable columns, no constraint / policy / view changes. Forward-only (no backfill).

alter table public.player_drill_load
  add column if not exists ima_accel_low  numeric,
  add column if not exists ima_accel_med  numeric,
  add column if not exists ima_accel_high numeric,
  add column if not exists ima_decel_low  numeric,
  add column if not exists ima_decel_med  numeric,
  add column if not exists ima_decel_high numeric,
  add column if not exists ima_cod_left   numeric,
  add column if not exists ima_cod_right  numeric,
  add column if not exists ima_cod_med    numeric,
  add column if not exists ima_cod_low    numeric;

alter table public.drill_library
  add column if not exists ima_accel        numeric,
  add column if not exists ima_decel        numeric,
  add column if not exists ima_accel_low    numeric,
  add column if not exists ima_accel_med    numeric,
  add column if not exists ima_accel_high   numeric,
  add column if not exists ima_decel_low    numeric,
  add column if not exists ima_decel_med    numeric,
  add column if not exists ima_decel_high   numeric,
  add column if not exists ima_cod_left     numeric,
  add column if not exists ima_cod_right    numeric,
  add column if not exists ima_cod_med      numeric,
  add column if not exists ima_cod_low      numeric,
  add column if not exists measured_on      date,
  add column if not exists measured_players integer,
  add column if not exists measured_no_gps  boolean;

comment on column public.drill_library.ima_accel is 'IMA accelerations per player (all intensities), from the last measured session';
comment on column public.drill_library.ima_decel is 'IMA braking efforts per player (all intensities), from the last measured session';
comment on column public.drill_library.ima_cod_left is 'IMA changes of direction to the left per player (all intensities)';
comment on column public.drill_library.ima_cod_right is 'IMA changes of direction to the right per player (all intensities)';
comment on column public.drill_library.measured_on is 'Date of the session the measured numbers came from';
comment on column public.drill_library.measured_players is 'Players averaged in that measurement';
comment on column public.drill_library.measured_no_gps is 'True when that session had no GPS reading (indoors): GPS columns were left as they were';

-- Backfill estimated metabolic values for drills that have player_load but no
-- Catapult-measured metabolic data.
--
-- Calibration fitted on team's own player_external_load_daily data (n=335):
--   HMLD_m                 ≈ 3.4 × player_load         (Pearson r = 0.54)
--   time_above_threshold_s ≈ 0.6 × player_load (≥ 0)   (Pearson r = 0.72)
--
-- Avg/Peak MetPwr are NOT estimated here — current ETL does not populate
-- metabolic_power (avg) consistently, and peak has no strong PL correlation.
-- These remain NULL until a coach enters them or the Catapult drill-segment
-- sync pipeline is built.

alter table public.drill_library
  add column if not exists metabolic_estimated boolean not null default false;

alter table public.drill_library_public
  add column if not exists metabolic_estimated boolean not null default false;

comment on column public.drill_library.metabolic_estimated
  is 'true if metabolic_power/hmld/time_above values are estimated from player_load (not Catapult-measured).';

update public.drill_library
set
  hmld_m                 = round((3.4 * player_load)::numeric, 0),
  time_above_threshold_s = round(greatest(0, 0.6 * player_load)::numeric, 0),
  metabolic_estimated    = true
where deleted_at is null
  and player_load is not null and player_load > 0
  and hmld_m is null
  and time_above_threshold_s is null;

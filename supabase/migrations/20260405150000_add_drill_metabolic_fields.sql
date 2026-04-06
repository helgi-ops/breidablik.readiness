-- Add Catapult Metabolic Power fields to drill_library + drill_library_public
--
-- Based on Osgnach et al. (2010) Energy Cost of Soccer; Polglaze & Hoppe (2019).
-- These complement the existing velocity/accel metrics by capturing the full
-- metabolic cost of accelerations — drills with many low-velocity but high-accel
-- moments (possession, 4v4) get accurate load representation.
--
-- Fields:
--   metabolic_power_avg   — average metabolic power over drill (W/kg)
--   metabolic_power_peak  — peak metabolic power (W/kg)
--   hmld_m                — high metabolic load distance (m > 25.5 W/kg)
--   time_above_threshold_s — time spent > 25.5 W/kg (seconds)

alter table public.drill_library
  add column if not exists metabolic_power_avg    numeric(4,1),
  add column if not exists metabolic_power_peak   numeric(4,1),
  add column if not exists hmld_m                 numeric(6,0),
  add column if not exists time_above_threshold_s numeric(5,0);

alter table public.drill_library_public
  add column if not exists metabolic_power_avg    numeric(4,1),
  add column if not exists metabolic_power_peak   numeric(4,1),
  add column if not exists hmld_m                 numeric(6,0),
  add column if not exists time_above_threshold_s numeric(5,0);

comment on column public.drill_library.metabolic_power_avg
  is 'Average metabolic power (W/kg) over the drill — Osgnach et al. (2010).';
comment on column public.drill_library.metabolic_power_peak
  is 'Peak metabolic power (W/kg) — signals highest-cost moment of the drill.';
comment on column public.drill_library.hmld_m
  is 'High Metabolic Load Distance (m) at > 25.5 W/kg — captures true high-intensity including accelerations.';
comment on column public.drill_library.time_above_threshold_s
  is 'Seconds spent > 25.5 W/kg — metabolic equivalent of time-at-HSR.';

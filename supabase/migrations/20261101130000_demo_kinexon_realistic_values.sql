-- Demo – Kinexon (de300004): make two demo values realistic for indoor basketball.
-- The team was seeded from a football-era shape, so max speed (~6 km/h) and peak
-- metabolic power (~600 W) were far too low (a real Kinexon basketball export
-- shows ~25 km/h max speed and multi-kW peak metabolic power). Scaling each
-- UNIFORMLY leaves every z-score / ACWR unchanged (today and baseline scale
-- together), so the metabolic composite and the panel ratios are untouched — only
-- the displayed magnitudes become believable.
--
-- Guarded so re-running doesn't re-scale. Demo seed only; descriptive.

update player_external_load_daily
set max_vel      = round(coalesce(max_vel, 0) * 3.3, 1),
    max_velocity = round(coalesce(max_velocity, 0) * 3.3, 1)
where team_id = 'de300004-0000-4000-8000-000000000004'
  and source = 'kinexon'
  and max_vel is not null and max_vel < 10;

update player_external_load_daily
set metabolic_power_peak = round(coalesce(metabolic_power_peak, 0) * 8)
where team_id = 'de300004-0000-4000-8000-000000000004'
  and source = 'kinexon'
  and metabolic_power_peak is not null and metabolic_power_peak < 1500;

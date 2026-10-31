-- Demo – Kinexon (de300004): populate raw_payload_json with representative
-- Kinexon Perform headers so the catalog-driven "Full Kinexon metrics" panel
-- demonstrates the families that live ONLY in raw (Acceleration Load, Mechanical
-- Load, Exertions, Physio Load, Changes of Orientation, FCT/MCT, Metabolic Work,
-- Anaerobic activity, Jump Height, TRIMP). A real upload carries these verbatim;
-- here they are derived deterministically from the row's own typed columns so the
-- demo is proportional and stable. Keys match the real export headers exactly so
-- the same catalog matching (normHeader) resolves demo and real data identically.
--
-- Demo seed only — synthetic, clearly flagged (demo:true). Descriptive external
-- load; no readiness colour is touched. Re-runnable (rebuilds the blob).

update player_external_load_daily
set raw_payload_json = jsonb_build_object(
  'provider', 'kinexon', 'indoor', true, 'demo', true,
  'Steps',                               round(coalesce(total_distance,0) * 1.5),
  'Distance / min (m)',                  round(coalesce(total_distance,0) / nullif(session_duration_minutes,0)),
  'Speed (Ø) (km/h)',                    round((coalesce(total_distance,0) / nullif(session_duration_minutes,0)) * 0.06, 1),
  'Acceleration Load (Ø)',               round(coalesce(player_load_per_minute,0) / 7.0, 2),
  'Acceleration Load (max.)',            round(coalesce(player_load_per_minute,0) / 7.0 * 7.5, 2),
  'Accels Load',                         round(coalesce(total_player_load,0) * 0.65),
  'Decels Load',                         round(coalesce(total_player_load,0) * 1.30),
  'Metabolic Work (kcal)',               round(coalesce(total_player_load,0) * 0.80),
  'Anaerobic Activity (distance) (m)',   round(coalesce(high_speed_distance,0) * 20),
  'Physio Load',                         round(coalesce(total_player_load,0) * 2.0),
  'Mechanical Load',                     round(coalesce(total_player_load,0) * 3.0),
  'Mechanical Intensity',                round(coalesce(player_load_per_minute,0) * 1.7, 1),
  'Jump Load (J)',                       round(coalesce(jumps,0) * 205),
  'Changes of Orientation',              round(coalesce(ima_cod,0) * 2.7),
  'Exertions',                           round((coalesce(accelerations,0) + coalesce(decelerations,0)) * 1.3),
  'Exertions (high)',                    round((coalesce(accel_b2_3_tot_effs_gen2,0) + coalesce(decel_b2_3_tot_effs_gen2,0)) * 0.5),
  'FCTs',                                round(coalesce(ima_cod,0) * 0.2),
  'MCTs',                                round(coalesce(ima_cod,0) * 0.3),
  'Jump Height (max.) (m)',              0.45,
  'TRIMP',                               round(coalesce(session_duration_minutes,0) * coalesce(avg_heart_rate,0) / 60.0)
)
where team_id = 'de300004-0000-4000-8000-000000000004'
  and source = 'kinexon';

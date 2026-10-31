/**
 * Kinexon row → player_external_load_daily upsert shape (pure).
 *
 * source='kinexon' — the same table Catapult/Titan/WIMU/manual write to, read
 * source-agnostically and deduped one row per (player, date, source). Kinexon is
 * an IMU / local-positioning system that fills the two Titan gaps: per-session
 * Duration and Changes of Direction (so MLI's CoD sub-score can run on real data).
 *
 * Descriptive external load only — never writes a readiness colour or decision.
 * "Mechanical Load" / "Jump Load" are Kinexon vendor metrics, preserved in
 * raw_payload_json and labelled as such — never equated with tissue load.
 */

import type { KinexonRow } from "./parseExport";

export interface KinexonExternalLoadRow {
  player_id: string;
  team_id: string;
  date: string;
  source: "kinexon";
  external_athlete_id: string;
  activity_count: number;
  session_duration_minutes: number | null;
  total_distance: number | null;
  high_speed_distance: number | null;
  hir_dist: number | null;
  sprint_distance: number | null;
  velocity_band5_total_distance: number | null;
  velocity_band6_total_distance: number | null;
  max_velocity: number | null;
  max_vel: number | null;
  player_load: number | null;
  total_player_load: number | null;
  player_load_per_minute: number | null;
  accelerations: number | null;
  decelerations: number | null;
  accel_b2_3_tot_effs_gen2: number | null;
  decel_b2_3_tot_effs_gen2: number | null;
  cod_events: number | null;
  ima_cod: number | null;
  jumps: number | null;
  metabolic_power: number | null;
  metabolic_power_peak: number | null;
  metabolic_energy_kj: number | null;
  high_metabolic_load_distance_m: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  min_heart_rate: number | null;
  footstrikes: number | null;
  raw_payload_json: unknown;
}

const intOrNull = (v: number | null): number | null => (v == null ? null : Math.round(v));

/**
 * Map one parsed Kinexon row to an upsert row. Returns null when it can't be keyed
 * (no date). `playerId` must already be resolved on the coach's own team.
 * `indoor` marks Kinexon LPS (indoor) vs GPS (outdoor) — default indoor (the
 * basketball LPS case); pass false for an outdoor GPS session.
 */
export function kinexonRowToExternalLoad(r: KinexonRow, playerId: string, teamId: string, indoor = true): KinexonExternalLoadRow | null {
  if (!r.date) return null;
  const perMin = r.playerLoadPerMinute ?? (r.playerLoad != null && r.durationMin && r.durationMin > 0
    ? Number((r.playerLoad / r.durationMin).toFixed(3))
    : null);
  return {
    player_id: playerId,
    team_id: teamId,
    date: r.date,
    source: "kinexon",
    external_athlete_id: r.playerName,
    activity_count: 1,
    session_duration_minutes: r.durationMin,
    total_distance: r.totalDistance,
    high_speed_distance: r.highSpeedDistance,
    hir_dist: r.highSpeedDistance,
    sprint_distance: r.sprintDistance,
    velocity_band5_total_distance: r.velocityBand5,
    velocity_band6_total_distance: r.velocityBand6,
    max_velocity: r.maxVelocity,
    max_vel: r.maxVelocity,
    player_load: r.playerLoad,
    total_player_load: r.playerLoad,
    player_load_per_minute: perMin,
    accelerations: intOrNull(r.accelerations),
    decelerations: intOrNull(r.decelerations),
    accel_b2_3_tot_effs_gen2: intOrNull(r.accelHighEfforts),
    decel_b2_3_tot_effs_gen2: intOrNull(r.decelHighEfforts),
    cod_events: intOrNull(r.codEvents),
    ima_cod: intOrNull(r.codEvents),
    jumps: intOrNull(r.jumps),
    metabolic_power: r.metabolicPower,
    metabolic_power_peak: r.metabolicPowerPeak,
    metabolic_energy_kj: r.metabolicEnergyKj,
    high_metabolic_load_distance_m: r.highMetabolicLoadDistanceM,
    avg_heart_rate: r.avgHeartRate,
    max_heart_rate: r.maxHeartRate,
    min_heart_rate: r.minHeartRate,
    footstrikes: r.footstrikes,
    // Full parsed row for audit, plus the Kinexon-specific extras that have no
    // dedicated column (mechanical/jump load vendor metrics, L/R CoD split).
    raw_payload_json: {
      provider: "kinexon",
      indoor,
      mechanical_load_kinexon: r.mechanicalLoad,
      jump_load_j: r.jumpLoadJ,
      cod_left: r.codLeft,
      cod_right: r.codRight,
      ...r.raw,
    },
  };
}

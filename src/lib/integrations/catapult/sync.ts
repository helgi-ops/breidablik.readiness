import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchActivitiesForDate, fetchActivityStats, fetchActivityStatsBatch, fetchActivityPeriodStats, fetchCatapultAthletes, setActiveCatapultConfig, getConfigFromEnv } from "./api";
import type { CatapultConfig } from "./api";
import { mapCatapultAthleteToPlayer, upsertCatapultAthleteMapping } from "./mapAthletes";
import { aggregateCatapultMetrics, normalizeCatapultActivityStats, normalizeCatapultPeriodStats, toNormalizedExternalLoad, mergeImaClock } from "./normalize";
import { aggregatePeriodsPerPlayer, writeSessionActuals, writePlayerDrillLoad, type PeriodRow } from "@/lib/micropulse/drillActuals";
import { extractMiiPeakPeriod } from "./miiPeakPeriod";
import { boundRawPayload } from "./rawPayloadCapture";
import type { CatapultAthlete, CatapultSyncResult } from "./types";

function dateKey(input?: string | null): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  return new Date().toISOString().slice(0, 10);
}

async function logIntegrationEvent(args: {
  provider: string;
  scope: string;
  status: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const sb = getSupabaseAdmin();
    await sb.from("integration_logs").insert({
      provider: args.provider,
      scope: args.scope,
      status: args.status,
      message: args.message,
      metadata: args.metadata ?? {},
    });
  } catch {
    // Avoid sync failure because logging table is unavailable.
  }
}

async function loadAthleteDirectory(): Promise<Map<string, CatapultAthlete>> {
  const athletes = await fetchCatapultAthletes();
  return new Map(athletes.map((athlete) => [athlete.id, athlete]));
}

type AggregatedRow = ReturnType<typeof toNormalizedExternalLoad>;

/**
 * High-cadence running distance: the sum of bands 5-8.
 *
 * Returns NULL — not 0 — when no band reported anything. The distinction matters:
 * 0 asserts "he ran no high-cadence metres", which is a claim about the athlete.
 * null says "we have no reading", which is a claim about the data. Collapsing the
 * second into the first is how a broken feed silently becomes a real-looking zero,
 * and it is exactly what let HK's missing IMA sit unnoticed for three months.
 */
/**
 * One band's free-running DISTANCE, or null when it cannot be measured.
 *
 * Free-running distance is GPS-derived: it needs satellite fix to know how far
 * each stride carried. Free-running STRIDE COUNT is inertial and works anywhere.
 * The two must not be conflated:
 *
 *   - Outdoor, distance > 0                → real reading, keep it.
 *   - Outdoor, distance 0 but strides > 0  → genuine 0 (ran high-cadence but
 *                                            covered no measured ground). Rare.
 *   - INDOOR (no GPS fix), strides present → distance is UNMEASURABLE, not 0.
 *     Storing 0 here says "he ran no high-cadence metres" when the truth is "we
 *     had no GPS to measure them". That is the zero-that-lies, and it is exactly
 *     what an indoor session produces: hundreds of strides, no distance.
 *   - No strides at all                    → the algorithm did not run → null.
 *
 * `gpsActive` is the session-level GPS signal (total_distance > 0). Without it,
 * an indoor session's inertial strides would fool the "strides ⇒ 0 is genuine"
 * rule into persisting a false zero.
 */
function frDist(
  distance: number | null | undefined,
  strides: number | null | undefined,
  gpsActive: boolean,
): number | null {
  if (typeof distance !== "number" || !Number.isFinite(distance)) return null;
  if (distance > 0) return distance;
  // Distance is 0. If the pod had no GPS fix this session, distance was never
  // measurable — null, not 0, no matter how many strides were recorded.
  if (!gpsActive) return null;
  const s = typeof strides === "number" && Number.isFinite(strides) ? strides : 0;
  return s > 0 ? 0 : null;
}

/**
 * Did this session have a GPS fix? Free-running DISTANCE is only measurable when
 * it did. The session's overall total_distance is the reliable signal: any GPS
 * fix produces metres, an indoor session produces none.
 */
function gpsActive(el: AggregatedRow["externalLoad"]): boolean {
  const d = el.totalDistance;
  return typeof d === "number" && Number.isFinite(d) && d > 0;
}

function sumBands58(el: AggregatedRow["externalLoad"]): number | null {
  // Indoor session (no GPS) → distance is unmeasurable, whatever the strides say.
  if (!gpsActive(el)) return null;
  const parts = [
    el.imaFrBand5TotalDistance,
    el.imaFrBand6TotalDistance,
    el.imaFrBand7TotalDistance,
    el.imaFrBand8TotalDistance,
  ].filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!parts.length) return null;

  const total = parts.reduce((a, b) => a + b, 0);
  if (total > 0) return total;

  // Total is zero. Is that a fact about the ATHLETE or about the DATA?
  //
  // If the pod recorded strides in these bands but they covered no ground, zero is
  // a real (if odd) reading. But if it recorded no strides EITHER, then the free-
  // running algorithm simply did not run — Catapult returns 0 for every field
  // rather than an error. That is the state HK has been in since April.
  //
  // Storing 0 there would assert "he did no high-cadence running", and ACWR would
  // faithfully conclude that no HK player ever runs hard. Storing null says "we
  // have no reading", which is the truth. This is the same distinction the rest of
  // this module is built on, and it is the easiest one in the world to get wrong.
  const strides = [
    el.imaFrBand5StrideCount,
    el.imaFrBand6StrideCount,
    el.imaFrBand7StrideCount,
    el.imaFrBand8StrideCount,
  ].reduce<number>((a, v) => a + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0);

  return strides > 0 ? 0 : null;
}

function sumNullable(a?: number | null, b?: number | null): number | null {
  const hasA = typeof a === "number";
  const hasB = typeof b === "number";
  if (!hasA && !hasB) return null;
  return (a ?? 0) + (b ?? 0);
}

function maxNullable(a?: number | null, b?: number | null): number | null {
  const hasA = typeof a === "number";
  const hasB = typeof b === "number";
  if (!hasA && !hasB) return null;
  return Math.max(a ?? Number.NEGATIVE_INFINITY, b ?? Number.NEGATIVE_INFINITY);
}

function mergeNormalizedRows(rows: AggregatedRow[]): AggregatedRow[] {
  const merged = new Map<string, AggregatedRow>();

  for (const row of rows) {
    const key = `${row.playerId}:${row.date}:${row.source}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...row, activityCount: row.activityCount ?? 1 });
      continue;
    }

    current.activityCount = (current.activityCount ?? 1) + (row.activityCount ?? 1);
    current.externalLoad.totalDistance = sumNullable(current.externalLoad.totalDistance, row.externalLoad.totalDistance);
    current.externalLoad.highSpeedDistance = sumNullable(current.externalLoad.highSpeedDistance, row.externalLoad.highSpeedDistance);
    current.externalLoad.sprintDistance = sumNullable(current.externalLoad.sprintDistance, row.externalLoad.sprintDistance);
    current.externalLoad.accelerations = sumNullable(current.externalLoad.accelerations, row.externalLoad.accelerations);
    current.externalLoad.decelerations = sumNullable(current.externalLoad.decelerations, row.externalLoad.decelerations);
    current.externalLoad.playerLoad = sumNullable(current.externalLoad.playerLoad, row.externalLoad.playerLoad);
    current.externalLoad.maxVelocity = maxNullable(current.externalLoad.maxVelocity, row.externalLoad.maxVelocity);
    current.externalLoad.velocityBand5TotalDistance = sumNullable(
      current.externalLoad.velocityBand5TotalDistance,
      row.externalLoad.velocityBand5TotalDistance
    );
    current.externalLoad.velocityBand6TotalDistance = sumNullable(
      current.externalLoad.velocityBand6TotalDistance,
      row.externalLoad.velocityBand6TotalDistance
    );
    current.externalLoad.velocityBand4TotalEffortsGen2 = sumNullable(
      current.externalLoad.velocityBand4TotalEffortsGen2,
      row.externalLoad.velocityBand4TotalEffortsGen2
    );
    current.externalLoad.velocityBand5TotalEffortsGen2 = sumNullable(
      current.externalLoad.velocityBand5TotalEffortsGen2,
      row.externalLoad.velocityBand5TotalEffortsGen2
    );
    current.externalLoad.velocityBand6TotalEffortsGen2 = sumNullable(
      current.externalLoad.velocityBand6TotalEffortsGen2,
      row.externalLoad.velocityBand6TotalEffortsGen2
    );
    current.externalLoad.hirDist = sumNullable(current.externalLoad.hirDist, row.externalLoad.hirDist);
    current.externalLoad.maxVel = maxNullable(current.externalLoad.maxVel, row.externalLoad.maxVel);
    current.externalLoad.accelB23TotEffsGen2 = sumNullable(
      current.externalLoad.accelB23TotEffsGen2,
      row.externalLoad.accelB23TotEffsGen2
    );
    current.externalLoad.totAs = sumNullable(current.externalLoad.totAs, row.externalLoad.totAs);
    current.externalLoad.decelB23TotEffsGen2 = sumNullable(
      current.externalLoad.decelB23TotEffsGen2,
      row.externalLoad.decelB23TotEffsGen2
    );
    current.externalLoad.decelB3PlusTotEffsGen2 = sumNullable(
      current.externalLoad.decelB3PlusTotEffsGen2,
      row.externalLoad.decelB3PlusTotEffsGen2
    );
    current.externalLoad.imaBand1DecelCount = sumNullable(
      current.externalLoad.imaBand1DecelCount,
      row.externalLoad.imaBand1DecelCount
    );
    current.externalLoad.imaBand2DecelCount = sumNullable(
      current.externalLoad.imaBand2DecelCount,
      row.externalLoad.imaBand2DecelCount
    );
    current.externalLoad.imaBand3DecelCount = sumNullable(
      current.externalLoad.imaBand3DecelCount,
      row.externalLoad.imaBand3DecelCount
    );
    current.externalLoad.imaBand1AccelCount = sumNullable(
      current.externalLoad.imaBand1AccelCount,
      row.externalLoad.imaBand1AccelCount
    );
    current.externalLoad.imaBand2AccelCount = sumNullable(
      current.externalLoad.imaBand2AccelCount,
      row.externalLoad.imaBand2AccelCount
    );
    current.externalLoad.imaBand3AccelCount = sumNullable(
      current.externalLoad.imaBand3AccelCount,
      row.externalLoad.imaBand3AccelCount
    );
    current.externalLoad.totDs = sumNullable(current.externalLoad.totDs, row.externalLoad.totDs);
    current.externalLoad.totalPlayerLoad = sumNullable(current.externalLoad.totalPlayerLoad, row.externalLoad.totalPlayerLoad);
    current.externalLoad.playerLoadPerMinute = maxNullable(
      current.externalLoad.playerLoadPerMinute,
      row.externalLoad.playerLoadPerMinute
    );
    current.externalLoad.metabolicPower = sumNullable(current.externalLoad.metabolicPower, row.externalLoad.metabolicPower);
    current.externalLoad.metabolicPowerPeak = maxNullable(
      current.externalLoad.metabolicPowerPeak,
      row.externalLoad.metabolicPowerPeak
    );
    current.externalLoad.highMetabolicLoadDistanceM = sumNullable(
      current.externalLoad.highMetabolicLoadDistanceM,
      row.externalLoad.highMetabolicLoadDistanceM
    );
    current.externalLoad.metabolicEnergyKj = sumNullable(
      current.externalLoad.metabolicEnergyKj,
      row.externalLoad.metabolicEnergyKj
    );
    current.externalLoad.timeAboveHmlThresholdS = sumNullable(
      current.externalLoad.timeAboveHmlThresholdS,
      row.externalLoad.timeAboveHmlThresholdS
    );
    if (row.externalLoad.metabolicPowerGen === "gen2") {
      current.externalLoad.metabolicPowerGen = "gen2";
    } else if (!current.externalLoad.metabolicPowerGen && row.externalLoad.metabolicPowerGen) {
      current.externalLoad.metabolicPowerGen = row.externalLoad.metabolicPowerGen;
    }
    if (row.externalLoad.metabolicDataValid) {
      current.externalLoad.metabolicDataValid = true;
    }
    current.externalLoad.explosiveDistance = sumNullable(current.externalLoad.explosiveDistance, row.externalLoad.explosiveDistance);
    current.externalLoad.imaAccel = sumNullable(current.externalLoad.imaAccel, row.externalLoad.imaAccel);
    current.externalLoad.imaDecel = sumNullable(current.externalLoad.imaDecel, row.externalLoad.imaDecel);
    current.externalLoad.imaCod = sumNullable(current.externalLoad.imaCod, row.externalLoad.imaCod);
    current.externalLoad.imaCodLeft = sumNullable(current.externalLoad.imaCodLeft, row.externalLoad.imaCodLeft);
    current.externalLoad.imaCodRight = sumNullable(current.externalLoad.imaCodRight, row.externalLoad.imaCodRight);
    current.externalLoad.imaCodLeftHigh   = sumNullable(current.externalLoad.imaCodLeftHigh,   row.externalLoad.imaCodLeftHigh);
    current.externalLoad.imaCodLeftMedium = sumNullable(current.externalLoad.imaCodLeftMedium, row.externalLoad.imaCodLeftMedium);
    current.externalLoad.imaCodLeftLow    = sumNullable(current.externalLoad.imaCodLeftLow,    row.externalLoad.imaCodLeftLow);
    current.externalLoad.imaCodRightHigh   = sumNullable(current.externalLoad.imaCodRightHigh,   row.externalLoad.imaCodRightHigh);
    current.externalLoad.imaCodRightMedium = sumNullable(current.externalLoad.imaCodRightMedium, row.externalLoad.imaCodRightMedium);
    current.externalLoad.imaCodRightLow    = sumNullable(current.externalLoad.imaCodRightLow,    row.externalLoad.imaCodRightLow);
    current.externalLoad.imaTotal = sumNullable(current.externalLoad.imaTotal, row.externalLoad.imaTotal);
    current.externalLoad.codEvents = sumNullable(current.externalLoad.codEvents, row.externalLoad.codEvents);
    current.externalLoad.impacts = sumNullable(current.externalLoad.impacts, row.externalLoad.impacts);
    current.externalLoad.jumps = sumNullable(current.externalLoad.jumps, row.externalLoad.jumps);
    current.externalLoad.imaClock = mergeImaClock(current.externalLoad.imaClock, row.externalLoad.imaClock);
    // Heart Rate: avg HR uses max across sessions as proxy; max HR takes max; zones sum
    current.externalLoad.avgHeartRate = maxNullable(current.externalLoad.avgHeartRate, row.externalLoad.avgHeartRate);
    current.externalLoad.maxHeartRate = maxNullable(current.externalLoad.maxHeartRate, row.externalLoad.maxHeartRate);
    current.externalLoad.hrZone1TimeS = sumNullable(current.externalLoad.hrZone1TimeS, row.externalLoad.hrZone1TimeS);
    current.externalLoad.hrZone2TimeS = sumNullable(current.externalLoad.hrZone2TimeS, row.externalLoad.hrZone2TimeS);
    current.externalLoad.hrZone3TimeS = sumNullable(current.externalLoad.hrZone3TimeS, row.externalLoad.hrZone3TimeS);
    current.externalLoad.hrZone4TimeS = sumNullable(current.externalLoad.hrZone4TimeS, row.externalLoad.hrZone4TimeS);
    current.externalLoad.hrZone5TimeS = sumNullable(current.externalLoad.hrZone5TimeS, row.externalLoad.hrZone5TimeS);
    // FMP: durations sum across sessions
    current.externalLoad.fmpVeryLowS = sumNullable(current.externalLoad.fmpVeryLowS, row.externalLoad.fmpVeryLowS);
    current.externalLoad.fmpLowIntensityS = sumNullable(current.externalLoad.fmpLowIntensityS, row.externalLoad.fmpLowIntensityS);
    current.externalLoad.fmpRunningMediumS = sumNullable(current.externalLoad.fmpRunningMediumS, row.externalLoad.fmpRunningMediumS);
    current.externalLoad.fmpRunningHighS = sumNullable(current.externalLoad.fmpRunningHighS, row.externalLoad.fmpRunningHighS);
    current.externalLoad.fmpDynamicLowS = sumNullable(current.externalLoad.fmpDynamicLowS, row.externalLoad.fmpDynamicLowS);
    current.externalLoad.fmpDynamicMediumS = sumNullable(current.externalLoad.fmpDynamicMediumS, row.externalLoad.fmpDynamicMediumS);
    current.externalLoad.fmpDynamicHighS = sumNullable(current.externalLoad.fmpDynamicHighS, row.externalLoad.fmpDynamicHighS);
    current.externalLoad.fmpTotalDurationS = sumNullable(current.externalLoad.fmpTotalDurationS, row.externalLoad.fmpTotalDurationS);
    // IMA Free Running 8 bands: stride counts + load sum, stride rate takes max
    {
      const cur = current.externalLoad as unknown as Record<string, number | null | undefined>;
      const inc = row.externalLoad as unknown as Record<string, number | null | undefined>;
      for (let band = 1; band <= 8; band++) {
        const sk = `imaFrBand${band}StrideCount`;
        const rk = `imaFrBand${band}AvgStrideRate`;
        const lk = `imaFrBand${band}TotalPlayerLoad`;
        cur[sk] = sumNullable(cur[sk], inc[sk]);
        const a = cur[rk];
        const b = inc[rk];
        cur[rk] = a != null && b != null ? Math.max(a, b) : (a ?? b ?? null);
        cur[lk] = sumNullable(cur[lk], inc[lk]);
      }
    }
  }

  return Array.from(merged.values());
}

async function enrichWithTeam(rows: AggregatedRow[]) {
  const sb = getSupabaseAdmin();
  const playerIds = Array.from(new Set(rows.map((row) => row.playerId)));
  if (!playerIds.length) return new Map<string, string | null>();
  const { data, error } = await sb.from("players").select("id, team_id").in("id", playerIds);
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), (row.team_id as string | null) ?? null]));
}

async function storeExternalLoadRows(rows: AggregatedRow[]): Promise<number> {
  const sb = getSupabaseAdmin();
  const teamByPlayer = await enrichWithTeam(rows);

  const payload = rows.map((row) => ({
    player_id: row.playerId,
    team_id: teamByPlayer.get(row.playerId) ?? null,
    date: row.date,
    total_distance: row.externalLoad.totalDistance,
    high_speed_distance: row.externalLoad.highSpeedDistance,
    sprint_distance: row.externalLoad.sprintDistance,
    accelerations: row.externalLoad.accelerations,
    decelerations: row.externalLoad.decelerations,
    player_load: row.externalLoad.playerLoad,
    max_velocity: row.externalLoad.maxVelocity,
    velocity_band5_total_distance: row.externalLoad.velocityBand5TotalDistance ?? null,
    velocity_band6_total_distance: row.externalLoad.velocityBand6TotalDistance ?? null,
    velocity_band4_total_efforts_gen2: row.externalLoad.velocityBand4TotalEffortsGen2 ?? null,
    velocity_band5_total_efforts_gen2: row.externalLoad.velocityBand5TotalEffortsGen2 ?? null,
    velocity_band6_total_efforts_gen2: row.externalLoad.velocityBand6TotalEffortsGen2 ?? null,
    hir_dist: row.externalLoad.hirDist ?? null,
    max_vel: row.externalLoad.maxVel ?? null,
    accel_b2_3_tot_effs_gen2: row.externalLoad.accelB23TotEffsGen2 ?? null,
    tot_as: row.externalLoad.totAs ?? null,
    decel_b2_3_tot_effs_gen2: row.externalLoad.decelB23TotEffsGen2 ?? null,
    decel_b3_plus_tot_effs_gen2: row.externalLoad.decelB3PlusTotEffsGen2 ?? null,
    ima_band1_decel_count: row.externalLoad.imaBand1DecelCount ?? null,
    ima_band2_decel_count: row.externalLoad.imaBand2DecelCount ?? null,
    ima_band3_decel_count: row.externalLoad.imaBand3DecelCount ?? null,
    ima_band1_accel_count: row.externalLoad.imaBand1AccelCount ?? null,
    ima_band2_accel_count: row.externalLoad.imaBand2AccelCount ?? null,
    ima_band3_accel_count: row.externalLoad.imaBand3AccelCount ?? null,
    tot_ds: row.externalLoad.totDs ?? null,
    total_player_load: row.externalLoad.totalPlayerLoad ?? null,
    player_load_per_minute: row.externalLoad.playerLoadPerMinute ?? null,
    metabolic_power: row.externalLoad.metabolicPower ?? null,
    metabolic_power_peak: row.externalLoad.metabolicPowerPeak ?? null,
    high_metabolic_load_distance_m: row.externalLoad.highMetabolicLoadDistanceM ?? null,
    metabolic_energy_kj: row.externalLoad.metabolicEnergyKj ?? null,
    time_above_hml_threshold_s: row.externalLoad.timeAboveHmlThresholdS ?? null,
    metabolic_power_gen: row.externalLoad.metabolicPowerGen ?? null,
    metabolic_data_valid: row.externalLoad.metabolicDataValid ?? false,
    metabolic_data_source: row.externalLoad.metabolicDataValid ? "catapult" : null,
    explosive_distance: row.externalLoad.explosiveDistance ?? null,
    ima_accel: row.externalLoad.imaAccel ?? null,
    ima_decel: row.externalLoad.imaDecel ?? null,
    ima_cod: row.externalLoad.imaCod ?? null,
    // L/R CoD splits per intensity tier (Bishop 2020 — high-intensity asymmetry
    // is the injury-relevant signal; low-tier is often a positional habit).
    // When the per-intensity values are unavailable (older payloads, certain
    // Catapult firmwares) we fall back to writing the aggregate into _low so
    // overall asymmetry computation still works downstream.
    ima_cod_left_high:   row.externalLoad.imaCodLeftHigh   ?? null,
    ima_cod_left_medium: row.externalLoad.imaCodLeftMedium ?? null,
    ima_cod_left_low:
      row.externalLoad.imaCodLeftLow
      ?? (
        row.externalLoad.imaCodLeftHigh == null && row.externalLoad.imaCodLeftMedium == null
          ? row.externalLoad.imaCodLeft ?? null
          : null
      ),
    ima_cod_right_high:   row.externalLoad.imaCodRightHigh   ?? null,
    ima_cod_right_medium: row.externalLoad.imaCodRightMedium ?? null,
    ima_cod_right_low:
      row.externalLoad.imaCodRightLow
      ?? (
        row.externalLoad.imaCodRightHigh == null && row.externalLoad.imaCodRightMedium == null
          ? row.externalLoad.imaCodRight ?? null
          : null
      ),
    ima_total: row.externalLoad.imaTotal ?? null,
    cod_events: row.externalLoad.codEvents ?? null,
    impacts: row.externalLoad.impacts ?? null,
    jumps: row.externalLoad.jumps ?? null,
    ima_clock_gen2: row.externalLoad.imaClock ?? null,
    // Newly-added Reporting_Parameters (24 Aug 2026): RHIE (repeated-sprint) +
    // running mechanical/asymmetry. Descriptive; null until a re-export carries them.
    rhie_bouts: row.externalLoad.rhieBouts ?? null,
    rhie_efforts_per_bout_mean: row.externalLoad.rhieEffortsPerBoutMean ?? null,
    rhie_efforts_per_bout_max: row.externalLoad.rhieEffortsPerBoutMax ?? null,
    rhie_efforts_per_bout_min: row.externalLoad.rhieEffortsPerBoutMin ?? null,
    rhie_effort_duration_mean_s: row.externalLoad.rhieEffortDurationMeanS ?? null,
    rhie_effort_recovery_mean_s: row.externalLoad.rhieEffortRecoveryMeanS ?? null,
    rhie_bout_recovery_mean_s: row.externalLoad.rhieBoutRecoveryMeanS ?? null,
    running_symmetry: row.externalLoad.runningSymmetry ?? null,
    running_deviation: row.externalLoad.runningDeviation ?? null,
    running_imbalance: row.externalLoad.runningImbalance ?? null,
    running_series_count: row.externalLoad.runningSeriesCount ?? null,
    footstrikes: row.externalLoad.footstrikes ?? null,
    source: "catapult",
    external_athlete_id: row.externalAthleteId,
    activity_count: row.activityCount ?? 1,
    // DIAGNOSTIC: bounded raw param sample so we can see the OpenField names
    // (e.g. why avg HR / HR zones don't map). Follow-up: add the right alias in
    // metricCatalog.ts / normalize.ts, or confirm the response omits them.
    raw_payload_json: boundRawPayload(row.rawPayload),
    avg_heart_rate: row.externalLoad.avgHeartRate ?? null,
    max_heart_rate: row.externalLoad.maxHeartRate ?? null,
    min_heart_rate: row.externalLoad.minHeartRate ?? null,
    hr_zone_1_time_s: row.externalLoad.hrZone1TimeS ?? null,
    hr_zone_2_time_s: row.externalLoad.hrZone2TimeS ?? null,
    hr_zone_3_time_s: row.externalLoad.hrZone3TimeS ?? null,
    hr_zone_4_time_s: row.externalLoad.hrZone4TimeS ?? null,
    hr_zone_5_time_s: row.externalLoad.hrZone5TimeS ?? null,
    hr_zone_6_time_s: row.externalLoad.hrZone6TimeS ?? null,
    hr_zone_7_time_s: row.externalLoad.hrZone7TimeS ?? null,
    hr_zone_8_time_s: row.externalLoad.hrZone8TimeS ?? null,
    hr_zone_1_avg_bpm: row.externalLoad.hrZone1AvgBpm ?? null,
    hr_zone_2_avg_bpm: row.externalLoad.hrZone2AvgBpm ?? null,
    hr_zone_3_avg_bpm: row.externalLoad.hrZone3AvgBpm ?? null,
    hr_zone_4_avg_bpm: row.externalLoad.hrZone4AvgBpm ?? null,
    hr_zone_5_avg_bpm: row.externalLoad.hrZone5AvgBpm ?? null,
    hr_zone_6_avg_bpm: row.externalLoad.hrZone6AvgBpm ?? null,
    hr_zone_7_avg_bpm: row.externalLoad.hrZone7AvgBpm ?? null,
    hr_zone_8_avg_bpm: row.externalLoad.hrZone8AvgBpm ?? null,
    pct_max_heart_rate: row.externalLoad.pctMaxHeartRate ?? null,
    pct_avg_heart_rate: row.externalLoad.pctAvgHeartRate ?? null,
    // FMP (Football Movement Profile)
    fmp_very_low_s: row.externalLoad.fmpVeryLowS ?? null,
    fmp_low_intensity_s: row.externalLoad.fmpLowIntensityS ?? null,
    fmp_running_medium_s: row.externalLoad.fmpRunningMediumS ?? null,
    fmp_running_high_s: row.externalLoad.fmpRunningHighS ?? null,
    fmp_dynamic_low_s: row.externalLoad.fmpDynamicLowS ?? null,
    fmp_dynamic_medium_s: row.externalLoad.fmpDynamicMediumS ?? null,
    fmp_dynamic_high_s: row.externalLoad.fmpDynamicHighS ?? null,
    fmp_total_duration_s: row.externalLoad.fmpTotalDurationS ?? null,
    fmp_dynamic_medium_pct: row.externalLoad.fmpDynamicMediumPct ?? null,
    fmp_dynamic_high_pct: row.externalLoad.fmpDynamicHighPct ?? null,
    fmp_running_high_pct: row.externalLoad.fmpRunningHighPct ?? null,
    session_duration_minutes: row.externalLoad.durationMinutes ?? null,
    // IMA Free Running 8 bands — indoor stride detail
    ima_fr_band1_stride_count: row.externalLoad.imaFrBand1StrideCount ?? null,
    ima_fr_band1_avg_stride_rate: row.externalLoad.imaFrBand1AvgStrideRate ?? null,
    ima_fr_band1_total_player_load: row.externalLoad.imaFrBand1TotalPlayerLoad ?? null,
    ima_fr_band2_stride_count: row.externalLoad.imaFrBand2StrideCount ?? null,
    ima_fr_band2_avg_stride_rate: row.externalLoad.imaFrBand2AvgStrideRate ?? null,
    ima_fr_band2_total_player_load: row.externalLoad.imaFrBand2TotalPlayerLoad ?? null,
    ima_fr_band3_stride_count: row.externalLoad.imaFrBand3StrideCount ?? null,
    ima_fr_band3_avg_stride_rate: row.externalLoad.imaFrBand3AvgStrideRate ?? null,
    ima_fr_band3_total_player_load: row.externalLoad.imaFrBand3TotalPlayerLoad ?? null,
    ima_fr_band4_stride_count: row.externalLoad.imaFrBand4StrideCount ?? null,
    ima_fr_band4_avg_stride_rate: row.externalLoad.imaFrBand4AvgStrideRate ?? null,
    ima_fr_band4_total_player_load: row.externalLoad.imaFrBand4TotalPlayerLoad ?? null,
    ima_fr_band5_stride_count: row.externalLoad.imaFrBand5StrideCount ?? null,
    ima_fr_band5_avg_stride_rate: row.externalLoad.imaFrBand5AvgStrideRate ?? null,
    ima_fr_band5_total_player_load: row.externalLoad.imaFrBand5TotalPlayerLoad ?? null,
    ima_fr_band6_stride_count: row.externalLoad.imaFrBand6StrideCount ?? null,
    ima_fr_band6_avg_stride_rate: row.externalLoad.imaFrBand6AvgStrideRate ?? null,
    ima_fr_band6_total_player_load: row.externalLoad.imaFrBand6TotalPlayerLoad ?? null,
    ima_fr_band7_stride_count: row.externalLoad.imaFrBand7StrideCount ?? null,
    ima_fr_band7_avg_stride_rate: row.externalLoad.imaFrBand7AvgStrideRate ?? null,
    ima_fr_band7_total_player_load: row.externalLoad.imaFrBand7TotalPlayerLoad ?? null,
    ima_fr_band8_stride_count: row.externalLoad.imaFrBand8StrideCount ?? null,
    ima_fr_band8_avg_stride_rate: row.externalLoad.imaFrBand8AvgStrideRate ?? null,
    ima_fr_band8_total_player_load: row.externalLoad.imaFrBand8TotalPlayerLoad ?? null,

    // Per-band DISTANCE (bands 5-8) — the high-cadence / sprint-stride end.
    // These columns existed and were read by six features, but nothing ever wrote
    // them: the sync never asked Catapult for the parameter. Every value that was
    // ever in them came from a one-off CSV import for one team in May.
    // Per band: a distance of 0 with 0 strides means the algorithm did not run, not
    // that he covered no ground. Store null so "no reading" never masquerades as a
    // measured zero. (See sumBands58 below — same rule, same reason.)
    ima_fr_band5_total_distance: frDist(row.externalLoad.imaFrBand5TotalDistance, row.externalLoad.imaFrBand5StrideCount, gpsActive(row.externalLoad)),
    ima_fr_band6_total_distance: frDist(row.externalLoad.imaFrBand6TotalDistance, row.externalLoad.imaFrBand6StrideCount, gpsActive(row.externalLoad)),
    ima_fr_band7_total_distance: frDist(row.externalLoad.imaFrBand7TotalDistance, row.externalLoad.imaFrBand7StrideCount, gpsActive(row.externalLoad)),
    ima_fr_band8_total_distance: frDist(row.externalLoad.imaFrBand8TotalDistance, row.externalLoad.imaFrBand8StrideCount, gpsActive(row.externalLoad)),
    // The 5-8 rollup — the single number loadPlan, estimatePod, playerGameReport,
    // progressiveOverload, strideIntelligence and the IMA card all read as
    // "high-intensity running distance". NOT a generated column, so it must be
    // written explicitly. Null (not 0) when no band reported, so "we have no data"
    // stays distinguishable from "he ran zero high-cadence metres".
    ima_fr_band58_total_distance: sumBands58(row.externalLoad),
  }));

  if (!payload.length) return 0;

  // Durable manual override: if a coach has entered a MANUAL GPS row for a
  // (player, date), that is an explicit correction of a forgot/broken pod. The
  // nightly Catapult sync must NOT overwrite it back to the pod value, so drop
  // those exact (player, date) pairs from this batch — the manual row stays the
  // one effective row for the day. Scoped to this batch's players/dates so it
  // stays a cheap lookup.
  const batchPlayerIds = Array.from(new Set(payload.map((p) => p.player_id).filter(Boolean)));
  const batchDates = Array.from(new Set(payload.map((p) => p.date)));
  const { data: manualRows } = await sb
    .from("player_external_load_daily")
    .select("player_id, date")
    .eq("source", "manual")
    .in("player_id", batchPlayerIds)
    .in("date", batchDates);
  const manualKeys = new Set(
    ((manualRows ?? []) as Array<{ player_id: string; date: string }>).map((r) => `${r.player_id}|${r.date}`),
  );
  const writable = manualKeys.size
    ? payload.filter((p) => !manualKeys.has(`${p.player_id}|${p.date}`))
    : payload;
  if (!writable.length) return 0;

  const { error } = await sb.from("player_external_load_daily").upsert(writable, {
    onConflict: "player_id,date,source",
  });
  if (error) throw new Error(error.message);
  return writable.length;
}

/**
 * Store the peak-period power curve (Catapult "Maximal Intensity Interval" params) into
 * player_load_peak_period. Fully best-effort: any failure (org hasn't enabled MII, no
 * rawPayload, DB error) is swallowed so it can NEVER affect the daily load sync — this
 * is descriptive context, not the readiness verdict. Reads each merged row's rawPayload
 * (the raw Catapult record, which carries the max_intensity_interval_* keys when enabled).
 */
async function storePeakPeriodRows(rows: AggregatedRow[]): Promise<number> {
  try {
    const sb = getSupabaseAdmin();
    const teamByPlayer = await enrichWithTeam(rows);
    const upserts: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      const raw = row.rawPayload;
      if (!raw || typeof raw !== "object") continue;
      const data = extractMiiPeakPeriod(raw as Record<string, unknown>);
      for (const d of data) {
        upserts.push({
          player_id: row.playerId,
          team_id: teamByPlayer.get(row.playerId) ?? null,
          date: row.date,
          source: "catapult",
          window_min: d.windowMin,
          metric: d.metric,
          value: d.value,
          unit: d.unit,
        });
      }
    }
    if (!upserts.length) return 0;
    const { error } = await sb
      .from("player_load_peak_period")
      .upsert(upserts as never, { onConflict: "player_id,date,source,window_min,metric" });
    if (error) throw new Error(error.message);
    return upserts.length;
  } catch {
    // Never let peak-period ingestion break the daily sync.
    return 0;
  }
}

export async function syncCatapultDailyMetrics(
  inputDate?: string | null,
  options?: { debugIma?: boolean; config?: CatapultConfig }
): Promise<CatapultSyncResult> {
  // Set active config for this sync run (multi-team support)
  if (options?.config) {
    setActiveCatapultConfig(options.config);
  }
  try {
    // Resolve the team whose roster athlete-matching is scoped to. A DB config
    // carries its teamId; the legacy env path resolves it from CATAPULT_TEAM_ID.
    // If neither yields a team, sourceTeamId stays null and matching is refused
    // (athletes recorded unmatched) — never a cross-team global match.
    let sourceTeamId = options?.config?.teamId ?? null;
    if (!sourceTeamId && !options?.config) {
      try { sourceTeamId = getConfigFromEnv().teamId ?? null; } catch { sourceTeamId = null; }
    }
    return await _syncCatapultDailyMetricsInner(inputDate, { debugIma: options?.debugIma, sourceTeamId });
  } finally {
    // Always reset config after sync to avoid leaking between teams
    if (options?.config) {
      setActiveCatapultConfig(null);
    }
  }
}

async function _syncCatapultDailyMetricsInner(
  inputDate?: string | null,
  options?: { debugIma?: boolean; sourceTeamId?: string | null }
): Promise<CatapultSyncResult> {
  const targetDate = dateKey(inputDate);
  const debugImaEnabled = options?.debugIma || process.env.CATAPULT_DEBUG_IMA === "true";
  const sourceTeamId = options?.sourceTeamId ?? null;
  const warnings: string[] = [];
  if (!sourceTeamId) {
    // No team scope — every athlete will be recorded unmatched (safe) instead of
    // matched against every club's roster. Surface it loudly so it's fixed.
    warnings.push("No source team resolved for Catapult matching (set CATAPULT_TEAM_ID). Athlete matching skipped to prevent cross-team mismatches.");
    await logIntegrationEvent({
      provider: "catapult",
      scope: "athlete-map",
      status: "warning",
      message: "Catapult sync ran without a source team — athlete matching skipped (set CATAPULT_TEAM_ID).",
      metadata: { date: targetDate },
    });
  }
  const athleteDirectory = await loadAthleteDirectory();
  const activities = await fetchActivitiesForDate(targetDate);

  const perActivityMetrics = [];
  let statsFetched = 0;
  if (activities.length) {
    try {
      const statsPayload = await fetchActivityStatsBatch(activities.map((activity) => activity.id));
      const normalized = normalizeCatapultActivityStats({
        date: targetDate,
        payload: statsPayload,
      });
      perActivityMetrics.push(...normalized);
      statsFetched = activities.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Catapult stats error";
      warnings.push(`Bulk stats fetch failed: ${message}`);
      await logIntegrationEvent({
        provider: "catapult",
        scope: "daily-sync",
        status: "warning",
        message: "Bulk Catapult stats fetch failed. Falling back to per-activity requests.",
        metadata: { date: targetDate, activityCount: activities.length, error: message },
      });

      for (const activity of activities) {
        try {
          const statsPayload = await fetchActivityStats(activity.id);
          const normalized = normalizeCatapultActivityStats({
            activityId: activity.id,
            date: targetDate,
            payload: statsPayload,
          });
          perActivityMetrics.push(...normalized);
          statsFetched += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown Catapult stats error";
          warnings.push(`Activity ${activity.id}: ${message}`);
          await logIntegrationEvent({
            provider: "catapult",
            scope: "daily-sync",
            status: "error",
            message,
            metadata: { activityId: activity.id, date: targetDate },
          });
        }
      }
    }
  }

  const aggregated = aggregateCatapultMetrics(perActivityMetrics);
  const normalizedRows = [];
  const imaDebug: NonNullable<CatapultSyncResult["imaDebug"]> = [];
  let unmatchedCount = 0;
  // Catapult athlete id → resolved micropulse player id, for the per-player
  // per-drill write below (period rows carry the same athlete id).
  const athleteToPlayer = new Map<string, string>();

  for (const metric of aggregated) {
    const athlete = athleteDirectory.get(metric.athleteId) ?? {
      id: metric.athleteId,
      firstName: "",
      lastName: "",
      email: null,
    };
    const mapped = await mapCatapultAthleteToPlayer(athlete, { sourceTeamId });
    if (!mapped) {
      unmatchedCount += 1;
      const athleteName = [athlete.firstName, athlete.lastName].filter(Boolean).join(" ").trim() || "(no name)";
      warnings.push(`Unmatched Catapult athlete ${metric.athleteId} (${athleteName})`);
      await logIntegrationEvent({
        provider: "catapult",
        scope: "athlete-map",
        status: "warning",
        message: "Unmatched Catapult athlete during daily sync.",
        metadata: { athleteId: metric.athleteId, athleteName, date: targetDate },
      });
      continue;
    }

    await upsertCatapultAthleteMapping(mapped);
    athleteToPlayer.set(metric.athleteId, mapped.micropulsePlayerId);
    normalizedRows.push(toNormalizedExternalLoad(metric, mapped.micropulsePlayerId));
    if (debugImaEnabled && metric.imaDebug) {
      imaDebug.push({
        athleteId: metric.athleteId,
        activityId: metric.activityId ?? null,
        matchedFields: metric.imaDebug,
        normalized: {
          ima_accel: metric.imaAccel ?? null,
          ima_decel: metric.imaDecel ?? null,
          ima_cod: metric.imaCod ?? null,
          ima_total: metric.imaTotal ?? null,
          cod_events: metric.codEvents ?? null,
          impacts: metric.impacts ?? null,
          jumps: metric.jumps ?? null,
          playerload_per_min: metric.playerLoadPerMinute ?? null,
        },
      });
    }
  }

  const mergedRows = mergeNormalizedRows(normalizedRows);
  const storedCount = await storeExternalLoadRows(mergedRows);

  // Peak-period power curve from MII params (best-effort; never affects the daily load).
  const peakPeriodCount = await storePeakPeriodRows(mergedRows);

  // ── Per-drill ACTUAL load from OpenField periods (best-effort) ──────────────
  // When the coach split this session into periods (one per drill), pull the
  // per-athlete-per-period stats, collapse to a squad mean-per-player, match each
  // period to a drill in that day's built session, and write the actuals. Fully
  // guarded: any failure (incl. the org not supporting period grouping) is
  // swallowed so it can never affect the daily sync. Verify group-by-period
  // against the live API before relying on this path.
  if (sourceTeamId && activities.length) {
    try {
      const periodRows: PeriodRow[] = [];
      for (const activity of activities) {
        try {
          const payload = await fetchActivityPeriodStats(activity.id);
          periodRows.push(...normalizeCatapultPeriodStats({ payload }));
        } catch { /* this activity has no queryable periods — skip */ }
      }
      const groups = aggregatePeriodsPerPlayer(periodRows);
      if (groups.length) {
        const sbActuals = getSupabaseAdmin();
        const res = await writeSessionActuals(sbActuals, sourceTeamId, targetDate, groups);
        // Per-PLAYER per-drill rows (the raw periodRows before the squad-mean
        // collapse), reusing the same period→drill match + athlete→player map.
        await writePlayerDrillLoad(
          sbActuals,
          { teamId: sourceTeamId, dateISO: targetDate, sessionId: res.sessionId, matchByNorm: res.matchByNorm, source: "catapult" },
          periodRows,
          (k) => athleteToPlayer.get(k) ?? null,
        );
      }
    } catch { /* actuals are best-effort — never fail the sync */ }
  }

  // Log metabolic data quality
  const metabolicValid = mergedRows.filter((r) => r.externalLoad.metabolicDataValid).length;
  const metabolicMissing = mergedRows.filter((r) => !r.externalLoad.metabolicDataValid).length;
  const metabolicPartial = mergedRows.filter(
    (r) => r.externalLoad.metabolicDataValid && (r.externalLoad.metabolicPower == null || r.externalLoad.highMetabolicLoadDistanceM == null)
  ).length;
  if (mergedRows.length > 0) {
    console.info(
      JSON.stringify({
        scope: "catapult_sync_metabolic",
        date: targetDate,
        metabolicValid,
        metabolicMissing,
        metabolicPartial,
      })
    );
  }

  // ── DIAGNOSTIC (capture-first, mirrors VALD resultKeysSeen): which parameter
  // names does OpenField actually send? avg HR + HR zones aren't mapping despite
  // comprehensive aliases — list the HR-ish keys seen so the follow-up can add
  // the right alias in metricCatalog.ts / normalize.ts, or confirm the response
  // omits them (the VALD thin-payload pattern). Full per-row params are in
  // raw_payload_json. ──────────────────────────────────────────────────────────
  const allParamKeys = new Set<string>();
  const hrParamKeys = new Set<string>();
  for (const r of mergedRows) {
    for (const k of r.paramKeys ?? []) {
      allParamKeys.add(k);
      // "heart" / "zone" / a standalone "hr" token (not "threshold", which contains "hr")
      if (/heart|zone|(?:^|[^a-z])hr(?:[^a-z]|$)/i.test(k)) hrParamKeys.add(k);
    }
  }
  const hrParamKeysSeen = [...hrParamKeys].sort();
  if (mergedRows.length > 0) {
    console.info(
      JSON.stringify({
        scope: "catapult_sync_hr_debug",
        date: targetDate,
        distinctParamKeys: allParamKeys.size,
        hrParamKeysSeen,
        paramKeysSample: [...allParamKeys].sort().slice(0, 60),
      }),
    );
  }

  if (debugImaEnabled) {
    const sampleDebug = imaDebug.slice(0, 3);
    const noImaFound = sampleDebug.length > 0 && sampleDebug.every((item) => item.matchedFields?.interestingKeys.length === 0);
    console.info(
      JSON.stringify({
        scope: "catapult_sync_ima_debug",
        date: targetDate,
        playersProcessed: aggregated.length,
        sampleSize: sampleDebug.length,
        noImaFound,
        samples: sampleDebug,
      })
    );
    if (!sampleDebug.length) {
      console.info(
        JSON.stringify({
          scope: "catapult_sync_ima_debug",
          date: targetDate,
          message: "No IMA-related fields found in Catapult payload for this activity/date",
        })
      );
    }
  }

  await logIntegrationEvent({
    provider: "catapult",
    scope: "daily-sync",
    status: "success",
    message: `Catapult sync completed for ${targetDate}.`,
    metadata: {
      athletesFetched: athleteDirectory.size,
      activitiesFetched: activities.length,
      statsFetched,
      normalizedCount: mergedRows.length,
      storedCount,
      peakPeriodCount,
      unmatchedCount,
      warnings,
      metabolicValid,
      metabolicMissing,
      metabolicPartial,
      // DIAGNOSTIC: parameter names OpenField actually sent (HR focus).
      distinctParamKeys: allParamKeys.size,
      hrParamKeysSeen,
    },
  });

  return {
    date: targetDate,
    athletesFetched: athleteDirectory.size,
    activitiesFetched: activities.length,
    statsFetched,
    normalizedCount: mergedRows.length,
    storedCount,
    peakPeriodCount,
    unmatchedCount,
    warnings,
    imaDebug: debugImaEnabled ? imaDebug : undefined,
  };
}

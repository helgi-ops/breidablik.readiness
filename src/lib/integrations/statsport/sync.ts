import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { fetchActivitiesForDate, fetchActivityStats, fetchStatSportAthletes } from "./api";
import type { StatSportAthlete, StatSportSessionMetric, StatSportSyncResult } from "./types";

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

// ─── Athlete mapping ─────────────────────────────────────────────────────────

async function loadAthleteMap(): Promise<Map<string, string>> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("statsport_athlete_map")
    .select("statsport_athlete_id, micropulse_player_id");
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.statsport_athlete_id), String(row.micropulse_player_id));
  }
  return map;
}

// ─── Row merging (same logic as Catapult) ────────────────────────────────────

function sumN(a?: number | null, b?: number | null): number | null {
  const hasA = typeof a === "number";
  const hasB = typeof b === "number";
  if (!hasA && !hasB) return null;
  return (a ?? 0) + (b ?? 0);
}

function maxN(a?: number | null, b?: number | null): number | null {
  const hasA = typeof a === "number";
  const hasB = typeof b === "number";
  if (!hasA && !hasB) return null;
  return Math.max(a ?? Number.NEGATIVE_INFINITY, b ?? Number.NEGATIVE_INFINITY);
}

type ExternalLoadRow = {
  player_id: string;
  team_id: string;
  date: string;
  source: "statsport";
  external_athlete_id: string;
  activity_count: number;
  total_distance: number | null;
  high_speed_distance: number | null;
  sprint_distance: number | null;
  accelerations: number | null;
  decelerations: number | null;
  player_load: number | null;
  max_velocity: number | null;
  velocity_band5_total_distance: number | null;
  velocity_band6_total_distance: number | null;
  hir_dist: number | null;
  max_vel: number | null;
  accel_b2_3_tot_effs_gen2: number | null;
  tot_as: number | null;
  decel_b2_3_tot_effs_gen2: number | null;
  tot_ds: number | null;
  total_player_load: number | null;
  player_load_per_minute: number | null;
  metabolic_power: number | null;
  metabolic_power_peak: number | null;
  high_metabolic_load_distance_m: number | null;
  metabolic_energy_kj: number | null;
  time_above_hml_threshold_s: number | null;
  metabolic_data_valid: boolean;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  hr_zone_1_time_s: number | null;
  hr_zone_2_time_s: number | null;
  hr_zone_3_time_s: number | null;
  hr_zone_4_time_s: number | null;
  hr_zone_5_time_s: number | null;
  raw_payload_json: unknown;
};

function metricToRow(m: StatSportSessionMetric, playerId: string, teamId: string, date: string): ExternalLoadRow {
  return {
    player_id: playerId,
    team_id: teamId,
    date,
    source: "statsport",
    external_athlete_id: m.athleteId,
    activity_count: 1,
    total_distance: m.totalDistance ?? null,
    high_speed_distance: m.highSpeedDistance ?? null,
    sprint_distance: m.sprintDistance ?? null,
    accelerations: m.accelerations ?? null,
    decelerations: m.decelerations ?? null,
    player_load: m.playerLoad ?? null,
    max_velocity: m.maxVelocity ?? null,
    velocity_band5_total_distance: m.velocityBand5TotalDistance ?? null,
    velocity_band6_total_distance: m.velocityBand6TotalDistance ?? null,
    hir_dist: m.hirDist ?? null,
    max_vel: m.maxVel ?? null,
    accel_b2_3_tot_effs_gen2: m.accelB23TotEffsGen2 ?? null,
    tot_as: m.totAs ?? null,
    decel_b2_3_tot_effs_gen2: m.decelB23TotEffsGen2 ?? null,
    tot_ds: m.totDs ?? null,
    total_player_load: m.totalPlayerLoad ?? null,
    player_load_per_minute: m.playerLoadPerMinute ?? null,
    metabolic_power: m.metabolicPower ?? null,
    metabolic_power_peak: m.metabolicPowerPeak ?? null,
    high_metabolic_load_distance_m: m.highMetabolicLoadDistanceM ?? null,
    metabolic_energy_kj: m.metabolicEnergyKj ?? null,
    time_above_hml_threshold_s: m.timeAboveHmlThresholdS ?? null,
    metabolic_data_valid: m.metabolicDataValid ?? false,
    avg_heart_rate: m.avgHeartRate ?? null,
    max_heart_rate: m.maxHeartRate ?? null,
    hr_zone_1_time_s: m.hrZone1TimeS ?? null,
    hr_zone_2_time_s: m.hrZone2TimeS ?? null,
    hr_zone_3_time_s: m.hrZone3TimeS ?? null,
    hr_zone_4_time_s: m.hrZone4TimeS ?? null,
    hr_zone_5_time_s: m.hrZone5TimeS ?? null,
    raw_payload_json: m,
  };
}

function mergeRows(rows: ExternalLoadRow[]): ExternalLoadRow[] {
  const merged = new Map<string, ExternalLoadRow>();
  for (const row of rows) {
    const key = `${row.player_id}:${row.date}`;
    const cur = merged.get(key);
    if (!cur) {
      merged.set(key, { ...row });
      continue;
    }
    cur.activity_count += row.activity_count;
    cur.total_distance = sumN(cur.total_distance, row.total_distance);
    cur.high_speed_distance = sumN(cur.high_speed_distance, row.high_speed_distance);
    cur.sprint_distance = sumN(cur.sprint_distance, row.sprint_distance);
    cur.accelerations = sumN(cur.accelerations, row.accelerations);
    cur.decelerations = sumN(cur.decelerations, row.decelerations);
    cur.player_load = sumN(cur.player_load, row.player_load);
    cur.max_velocity = maxN(cur.max_velocity, row.max_velocity);
    cur.velocity_band5_total_distance = sumN(cur.velocity_band5_total_distance, row.velocity_band5_total_distance);
    cur.velocity_band6_total_distance = sumN(cur.velocity_band6_total_distance, row.velocity_band6_total_distance);
    cur.hir_dist = sumN(cur.hir_dist, row.hir_dist);
    cur.max_vel = maxN(cur.max_vel, row.max_vel);
    cur.total_player_load = sumN(cur.total_player_load, row.total_player_load);
    cur.player_load_per_minute = maxN(cur.player_load_per_minute, row.player_load_per_minute);
    cur.metabolic_power = sumN(cur.metabolic_power, row.metabolic_power);
    cur.metabolic_power_peak = maxN(cur.metabolic_power_peak, row.metabolic_power_peak);
    cur.high_metabolic_load_distance_m = sumN(cur.high_metabolic_load_distance_m, row.high_metabolic_load_distance_m);
    cur.avg_heart_rate = maxN(cur.avg_heart_rate, row.avg_heart_rate);
    cur.max_heart_rate = maxN(cur.max_heart_rate, row.max_heart_rate);
  }
  return [...merged.values()];
}

// ─── Main sync function ─────────────────────────────────────────────────────

export async function syncStatSportDailyMetrics(date?: string | null): Promise<StatSportSyncResult> {
  const day = dateKey(date);
  const warnings: string[] = [];

  await logIntegrationEvent({
    provider: "statsport",
    scope: "daily-sync",
    status: "started",
    message: `StatSport sync started for ${day}`,
    metadata: { date: day },
  });

  // 1. Fetch activities for the date
  const activities = await fetchActivitiesForDate(day);
  if (!activities.length) {
    const msg = `No StatSport activities found for ${day}.`;
    warnings.push(msg);
    await logIntegrationEvent({ provider: "statsport", scope: "daily-sync", status: "empty", message: msg });
    return { date: day, athletesFetched: 0, activitiesFetched: 0, statsFetched: 0, normalizedCount: 0, storedCount: 0, unmatchedCount: 0, warnings };
  }

  // 2. Fetch stats for each activity
  const allMetrics: StatSportSessionMetric[] = [];
  for (const activity of activities) {
    const stats = await fetchActivityStats(activity.id);
    allMetrics.push(...stats);
  }

  // 3. Load athlete mapping
  const athleteMap = await loadAthleteMap();
  const sb = getSupabaseAdmin();

  // 4. Get team_id from first mapped player
  let teamId = "";
  for (const [, playerId] of athleteMap) {
    const { data: prof } = await sb.from("profiles").select("team_id").eq("id", playerId).maybeSingle();
    if (prof?.team_id) {
      teamId = String(prof.team_id);
      break;
    }
  }

  // 5. Map and normalize metrics
  const rows: ExternalLoadRow[] = [];
  let unmatchedCount = 0;
  for (const metric of allMetrics) {
    const playerId = athleteMap.get(metric.athleteId);
    if (!playerId) {
      unmatchedCount++;
      continue;
    }
    rows.push(metricToRow(metric, playerId, teamId, day));
  }

  // 6. Merge multiple activities per player
  const merged = mergeRows(rows);

  // 7. Upsert into player_external_load_daily
  let storedCount = 0;
  for (const row of merged) {
    const { error } = await sb
      .from("player_external_load_daily")
      .upsert(row, { onConflict: "player_id,date,source" });
    if (error) {
      warnings.push(`Upsert failed for player ${row.player_id}: ${error.message}`);
    } else {
      storedCount++;
    }
  }

  await logIntegrationEvent({
    provider: "statsport",
    scope: "daily-sync",
    status: "completed",
    message: `StatSport sync completed for ${day}: ${storedCount} stored, ${unmatchedCount} unmatched`,
    metadata: { date: day, storedCount, unmatchedCount, activitiesCount: activities.length },
  });

  return {
    date: day,
    athletesFetched: new Set(allMetrics.map((m) => m.athleteId)).size,
    activitiesFetched: activities.length,
    statsFetched: allMetrics.length,
    normalizedCount: merged.length,
    storedCount,
    unmatchedCount,
    warnings,
  };
}

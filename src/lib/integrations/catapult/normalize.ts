import type { CatapultSessionMetric, NormalizedExternalLoad } from "./types";

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toInteger(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed == null ? null : Math.round(parsed);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function extractMetric(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value != null) return value;
  }
  return null;
}

function extractAthleteId(record: Record<string, unknown>): string | null {
  const direct = record.athleteId ?? record.athlete_id ?? record.player_id ?? record.id;
  return typeof direct === "string" && direct.trim().length ? direct.trim() : null;
}

function extractActivityId(record: Record<string, unknown>): string | null {
  const direct = record.activityId ?? record.activity_id ?? record.session_id ?? record.practice_id;
  return typeof direct === "string" && direct.trim().length ? direct.trim() : null;
}

export function normalizeCatapultActivityStats(args: { activityId?: string | null; date: string; payload: unknown }): CatapultSessionMetric[] {
  const rows = (() => {
    if (Array.isArray(args.payload)) return args.payload;
    const record = asRecord(args.payload);
    if (!record) return [];
    return (
      asArray(record.stats) ||
      asArray(record.athletes) ||
      asArray(record.data) ||
      asArray(record.results) ||
      asArray(record.items)
    );
  })();

  const normalized: CatapultSessionMetric[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const athleteId = extractAthleteId(record);
    if (!athleteId) continue;
    const activityId = extractActivityId(record) ?? args.activityId ?? null;

    normalized.push({
      athleteId,
      date: args.date,
      activityId,
      totalDistance: extractMetric(record, ["total_distance", "distance", "totalDistance"]) ?? 0,
      highSpeedDistance:
        extractMetric(record, ["hir_dist", "high_speed_distance", "highSpeedDistance", "hsd"]) ?? 0,
      sprintDistance:
        extractMetric(record, ["velocity_band6_total_distance", "sprint_distance", "sprintDistance"]) ?? 0,
      accelerations:
        toInteger(
          extractMetric(record, [
            "gen2_acceleration_band6plus_average_effort_count",
            "tot_as",
            "acceleration_efforts_gen2",
            "accelerations",
            "accels",
          ]),
        ) ?? 0,
      decelerations:
        toInteger(
          extractMetric(record, [
            "gen2_acceleration_band3plus_average_effort_count",
            "tot_ds",
            "deceleration_efforts_gen2",
            "decelerations",
            "decels",
          ]),
        ) ?? 0,
      playerLoad:
        extractMetric(record, ["total_player_load", "player_load", "playerLoad", "load"]) ?? 0,
      maxVelocity: extractMetric(record, ["max_vel", "max_velocity", "maxVelocity", "top_speed"]) ?? 0,
      velocityBand5TotalDistance: extractMetric(record, ["velocity_band5_total_distance"]),
      velocityBand6TotalDistance: extractMetric(record, ["velocity_band6_total_distance"]),
      hirDist: extractMetric(record, ["hir_dist"]),
      maxVel: extractMetric(record, ["max_vel"]),
      accelB23TotEffsGen2: toInteger(
        extractMetric(record, [
          "gen2_acceleration_band7plus_total_effort_count",
          "accel_b2_3_tot_effs_gen2",
          "acceleration_band2plus_total_efforts_gen2",
        ]),
      ),
      totAs: toInteger(
        extractMetric(record, [
          "gen2_acceleration_band6plus_average_effort_count",
          "tot_as",
          "acceleration_efforts_gen2",
        ]),
      ),
      decelB23TotEffsGen2: toInteger(
        extractMetric(record, [
          "gen2_acceleration_band2plus_total_effort_count",
          "decel_b2_3_tot_effs_gen2",
          "deceleration_band2plus_total_efforts_gen2",
        ]),
      ),
      totDs: toInteger(
        extractMetric(record, [
          "gen2_acceleration_band3plus_average_effort_count",
          "tot_ds",
          "deceleration_efforts_gen2",
        ]),
      ),
      totalPlayerLoad: extractMetric(record, ["total_player_load"]),
      playerLoadPerMinute: extractMetric(record, ["player_load_per_minute"]),
      metabolicPower: extractMetric(record, ["metabolic_power", "metabolicPower"]),
      explosiveDistance: extractMetric(record, ["explosive_distance", "explosiveDistance"]),
    });
  }

  return normalized;
}

export function aggregateCatapultMetrics(metrics: CatapultSessionMetric[]): CatapultSessionMetric[] {
  const byAthleteDate = new Map<string, CatapultSessionMetric>();
  const seenActivityAthlete = new Set<string>();

  for (const metric of metrics) {
    const dedupeKey = `${metric.activityId ?? "unknown"}:${metric.athleteId}:${metric.date}`;
    if (seenActivityAthlete.has(dedupeKey)) continue;
    seenActivityAthlete.add(dedupeKey);

    const key = `${metric.athleteId}:${metric.date}`;
    const current = byAthleteDate.get(key);
    if (!current) {
      byAthleteDate.set(key, { ...metric });
      continue;
    }

    current.totalDistance += metric.totalDistance;
    current.highSpeedDistance += metric.highSpeedDistance;
    current.sprintDistance += metric.sprintDistance;
    current.accelerations += metric.accelerations;
    current.decelerations += metric.decelerations;
    current.playerLoad += metric.playerLoad;
    current.maxVelocity = Math.max(current.maxVelocity, metric.maxVelocity);
    current.velocityBand5TotalDistance = (current.velocityBand5TotalDistance ?? 0) + (metric.velocityBand5TotalDistance ?? 0);
    current.velocityBand6TotalDistance = (current.velocityBand6TotalDistance ?? 0) + (metric.velocityBand6TotalDistance ?? 0);
    current.hirDist = (current.hirDist ?? 0) + (metric.hirDist ?? 0);
    current.maxVel = Math.max(current.maxVel ?? 0, metric.maxVel ?? 0);
    current.accelB23TotEffsGen2 = (current.accelB23TotEffsGen2 ?? 0) + (metric.accelB23TotEffsGen2 ?? 0);
    current.totAs = (current.totAs ?? 0) + (metric.totAs ?? 0);
    current.decelB23TotEffsGen2 = (current.decelB23TotEffsGen2 ?? 0) + (metric.decelB23TotEffsGen2 ?? 0);
    current.totDs = (current.totDs ?? 0) + (metric.totDs ?? 0);
    current.totalPlayerLoad = (current.totalPlayerLoad ?? 0) + (metric.totalPlayerLoad ?? 0);
    current.playerLoadPerMinute = Math.max(current.playerLoadPerMinute ?? 0, metric.playerLoadPerMinute ?? 0);
    current.metabolicPower = (current.metabolicPower ?? 0) + (metric.metabolicPower ?? 0);
    current.explosiveDistance = (current.explosiveDistance ?? 0) + (metric.explosiveDistance ?? 0);
  }

  return Array.from(byAthleteDate.values());
}

export function toNormalizedExternalLoad(metric: CatapultSessionMetric, playerId: string): NormalizedExternalLoad {
  return {
    playerId,
    date: metric.date,
    source: "catapult",
    externalAthleteId: metric.athleteId,
    activityCount: 1,
    externalLoad: {
      totalDistance: metric.totalDistance,
      highSpeedDistance: metric.highSpeedDistance,
      sprintDistance: metric.sprintDistance,
      accelerations: metric.accelerations,
      decelerations: metric.decelerations,
      playerLoad: metric.playerLoad,
      maxVelocity: metric.maxVelocity,
      velocityBand5TotalDistance: metric.velocityBand5TotalDistance ?? null,
      velocityBand6TotalDistance: metric.velocityBand6TotalDistance ?? null,
      hirDist: metric.hirDist ?? null,
      maxVel: metric.maxVel ?? null,
      accelB23TotEffsGen2: metric.accelB23TotEffsGen2 ?? null,
      totAs: metric.totAs ?? null,
      decelB23TotEffsGen2: metric.decelB23TotEffsGen2 ?? null,
      totDs: metric.totDs ?? null,
      totalPlayerLoad: metric.totalPlayerLoad ?? null,
      playerLoadPerMinute: metric.playerLoadPerMinute ?? null,
      metabolicPower: metric.metabolicPower ?? null,
      explosiveDistance: metric.explosiveDistance ?? null,
    },
  };
}

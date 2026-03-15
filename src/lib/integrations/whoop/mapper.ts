import type { NormalizedMonitoringSnapshot } from "@/lib/integrations/shared/types";
import type { WhoopRecoveryRecord, WhoopSleepRecord, WhoopWorkoutRecord } from "./types";

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function average(values: number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Maps WHOOP records into one deterministic daily normalized snapshot.
 */
export function mapWhoopDailySnapshot(args: {
  athleteId: string;
  date: string;
  recovery?: WhoopRecoveryRecord | null;
  sleep?: WhoopSleepRecord | null;
  workouts?: WhoopWorkoutRecord[];
}): NormalizedMonitoringSnapshot {
  const workouts = args.workouts ?? [];
  const strainValues = workouts.map((w) => asNumber(w.score?.strain ?? w.strain)).filter((v): v is number => v != null);
  const avgHrValues = workouts
    .map((w) => asNumber(w.score?.average_heart_rate ?? w.average_heart_rate))
    .filter((v): v is number => v != null);
  const maxHrValues = workouts.map((w) => asNumber(w.score?.max_heart_rate ?? w.max_heart_rate)).filter((v): v is number => v != null);

  const snapshot: NormalizedMonitoringSnapshot = {
    athleteId: args.athleteId,
    source: "whoop",
    date: args.date,
    recoveryScore: asNumber(args.recovery?.score?.recovery_score),
    hrv: asNumber(args.recovery?.score?.hrv_rmssd_milli),
    restingHr: asNumber(args.recovery?.score?.resting_heart_rate),
    respiratoryRate: asNumber(args.recovery?.score?.respiratory_rate),
    sleepPerformance: asNumber(args.sleep?.score?.sleep_performance_percentage),
    sleepConsistency: asNumber(args.sleep?.score?.sleep_consistency_percentage),
    sleepEfficiency: asNumber(args.sleep?.score?.sleep_efficiency_percentage),
    totalSleepMillis: asNumber(args.sleep?.total_in_bed_time_milli ?? args.sleep?.total_sleep_time_milli),
    workoutStrain: strainValues.length ? strainValues.reduce((sum, value) => sum + value, 0) : undefined,
    averageHr: average(avgHrValues),
    maxHr: maxHrValues.length ? Math.max(...maxHrValues) : undefined,
    raw: {
      recovery: args.recovery ?? null,
      sleep: args.sleep ?? null,
      workouts,
    },
  };

  return snapshot;
}


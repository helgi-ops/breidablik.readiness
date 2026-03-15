import type { NormalizedMonitoringSnapshot } from "./types";
export { buildWhoopFusionInputFromSnapshot, buildReadinessWhoopSection } from "./whoopReadinessAdapter";

export type ReadinessSupplementInput = {
  recovery?: number | null;
  sleepScore?: number | null;
  restingHr?: number | null;
  hrv?: number | null;
  strain?: number | null;
};


/**
 * Maps normalized integration snapshots into a conservative readiness supplement.
 * This enriches existing readiness/manual inputs and does not replace decision logic.
 */
export function mapSnapshotToReadinessSupplement(snapshot: NormalizedMonitoringSnapshot): ReadinessSupplementInput {
  return {
    recovery: snapshot.recoveryScore ?? null,
    sleepScore: snapshot.sleepPerformance ?? null,
    restingHr: snapshot.restingHr ?? null,
    hrv: snapshot.hrv ?? null,
    strain: snapshot.workoutStrain ?? null,
  };
}

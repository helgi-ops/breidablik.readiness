import type { NormalizedMonitoringSnapshot } from "./types";
import type { ReadinessWhoopSection } from "@/lib/micropulse/integrations/whoopFusion/types";
import { buildWhoopFusionFeatures, buildWhoopExplanationLines } from "@/lib/micropulse/integrations/whoopFusion";
import type { WhoopFusionInput } from "@/lib/micropulse/integrations/whoopFusion/types";

/**
 * Converts a normalized WHOOP snapshot into WHOOP fusion input fields.
 * Ensures readiness rules consume a consistent, fully-typed shape.
 */
export function buildWhoopFusionInputFromSnapshot(snapshot: NormalizedMonitoringSnapshot): WhoopFusionInput {
  return {
    recoveryScore: snapshot.recoveryScore,
    hrv: snapshot.hrv,
    restingHr: snapshot.restingHr,
    respiratoryRate: snapshot.respiratoryRate,
    sleepPerformance: snapshot.sleepPerformance,
    sleepConsistency: snapshot.sleepConsistency,
    sleepEfficiency: snapshot.sleepEfficiency,
    totalSleepMillis: snapshot.totalSleepMillis,
    workoutStrain: snapshot.workoutStrain,
    averageHr: snapshot.averageHr,
    maxHr: snapshot.maxHr,
  };
}

/**
 * Converts a normalized WHOOP snapshot into compact readiness-ready fusion features.
 */
export function buildReadinessWhoopSection(snapshot: NormalizedMonitoringSnapshot): ReadinessWhoopSection {
  const features = buildWhoopFusionFeatures(buildWhoopFusionInputFromSnapshot(snapshot));
  return {
    hasWhoopData: features.hasWhoopData,
    recoverySupportScore: features.recoverySupportScore,
    sleepSupportScore: features.sleepSupportScore,
    autonomicSupportScore: features.autonomicSupportScore,
    loadSupportScore: features.loadSupportScore,
    overallSupportScore: features.overallSupportScore,
    recoveryFlag: features.recoveryFlag,
    sleepFlag: features.sleepFlag,
    autonomicFlag: features.autonomicFlag,
    loadFlag: features.loadFlag,
    confidence: features.confidence,
    explanationLines: buildWhoopExplanationLines(features),
    missingFields: features.missingFields,
    notes: features.notes,
  };
}

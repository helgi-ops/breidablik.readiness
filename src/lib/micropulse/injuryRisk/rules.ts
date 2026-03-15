import type { InjuryRiskInput } from "./types";

export type InjuryRiskRuleResult = {
  injuryRiskLevel: "LOW" | "MODERATE" | "HIGH";
  confidence: "low" | "medium" | "high";
  riskScore: number;
  triggeredRules: string[];
  missingInputs: string[];
};

function hasNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}

export function evaluateInjuryRiskRules(
  input: InjuryRiskInput,
  readinessDecision?: { athleteState: "GREEN" | "YELLOW" | "RED" | "GRAY" } | null
): InjuryRiskRuleResult {
  const triggeredRules: string[] = [];
  const missingInputs: string[] = [];

  if (!hasNumber(input.acwr)) missingInputs.push("acwr");
  if (!hasNumber(input.deltaZ)) missingInputs.push("deltaZ");
  if (!hasNumber(input.volatility)) missingInputs.push("volatility");
  if (!hasNumber(input.sleepScore)) missingInputs.push("sleepScore");
  if (!hasNumber(input.hrvChangePct)) missingInputs.push("hrvChangePct");
  if (!hasNumber(input.sorenessScore)) missingInputs.push("sorenessScore");

  const lowReadinessState =
    readinessDecision?.athleteState === "RED" ||
    readinessDecision?.athleteState === "YELLOW" ||
    readinessDecision?.athleteState === "GRAY";
  const acuteWorkloadSpike =
    (hasNumber(input.highSpeedRunning) && (input.highSpeedRunning as number) >= 800) || input.gpsSpike === true;
  const elevatedAcwr = hasNumber(input.acwr) && (input.acwr as number) >= 1.3;
  const negativeDeltaZ = hasNumber(input.deltaZ) && (input.deltaZ as number) <= -0.25;
  const poorRecovery =
    (hasNumber(input.sleepScore) && (input.sleepScore as number) <= 2) ||
    (hasNumber(input.hrvChangePct) && (input.hrvChangePct as number) <= -8);
  const highVolatility = hasNumber(input.volatility) && (input.volatility as number) >= 35;
  const repeatedWarningDays =
    ((input.recentYellowDays ?? 0) + (input.recentRedDays ?? 0)) >= 2 ||
    (input.recentRedDays ?? 0) >= 1;
  const lowSorenessCaution = (hasNumber(input.sorenessScore) && (input.sorenessScore as number) <= 2) || input.sorenessFlag === true;
  const goodSorenessSignal = hasNumber(input.sorenessScore) && (input.sorenessScore as number) >= 4 && input.painFlag !== true;
  const sorenessPain = lowSorenessCaution || input.painFlag === true;
  const congestionTravel = input.matchCongestion === true || input.travelLoad === true;
  const gpsSpikeRecovery = input.gpsSpike === true && poorRecovery;
  const strongReadinessDay =
    hasNumber(input.zScore) &&
    (input.zScore as number) > 1.5 &&
    goodSorenessSignal &&
    !poorRecovery &&
    !lowReadinessState &&
    input.painFlag !== true;

  let riskScore = 0;
  if (acuteWorkloadSpike) {
    triggeredRules.push("RAPID_WORKLOAD_INCREASE");
    riskScore += 2;
  }
  if (elevatedAcwr) {
    triggeredRules.push("ELEVATED_ACWR");
    riskScore += 2;
  }
  if (lowReadinessState) {
    triggeredRules.push("LOW_READINESS_STATE");
    riskScore += 1;
  }
  if (negativeDeltaZ) {
    triggeredRules.push("NEGATIVE_DELTA_Z");
    riskScore += 1;
  }
  if (poorRecovery) {
    triggeredRules.push("POOR_RECOVERY_MARKERS");
    riskScore += 2;
  }
  if (highVolatility && !strongReadinessDay) {
    triggeredRules.push("HIGH_VOLATILITY");
    riskScore += 1;
  }
  if (repeatedWarningDays) {
    triggeredRules.push("REPEATED_WARNING_DAYS");
    riskScore += 2;
  }
  if (sorenessPain) {
    triggeredRules.push("SORENESS_PAIN_FLAG");
    riskScore += 2;
  }
  if (goodSorenessSignal) {
    triggeredRules.push("GOOD_SORENESS_SIGNAL");
    riskScore = Math.max(0, riskScore - 1);
  }
  if (congestionTravel && poorRecovery) {
    triggeredRules.push("CONGESTION_TRAVEL_RECOVERY_STRAIN");
    riskScore += 2;
  }
  if (gpsSpikeRecovery) {
    triggeredRules.push("GPS_SPIKE_POOR_RECOVERY");
    riskScore += 2;
  }

  let injuryRiskLevel: "LOW" | "MODERATE" | "HIGH" = "LOW";
  if (riskScore >= 8) injuryRiskLevel = "HIGH";
  else if (riskScore >= 4) injuryRiskLevel = "MODERATE";

  const presentCount = [
    hasNumber(input.acwr),
    hasNumber(input.deltaZ),
    hasNumber(input.volatility),
    hasNumber(input.sleepScore),
    hasNumber(input.hrvChangePct),
    hasNumber(input.highSpeedRunning),
  ].filter(Boolean).length;

  let confidence: "low" | "medium" | "high" = "medium";
  if (presentCount <= 2) confidence = "low";
  if (presentCount >= 4 && triggeredRules.length >= 2) confidence = "high";
  if (injuryRiskLevel === "HIGH" && triggeredRules.length <= 1) confidence = "low";

  return { injuryRiskLevel, confidence, riskScore, triggeredRules, missingInputs };
}

export type InjuryRiskLevel = "LOW" | "MODERATE" | "HIGH";
export type InjuryRiskConfidence = "low" | "medium" | "high";

export interface InjuryRiskDecision {
  injuryRiskLevel: InjuryRiskLevel;
  confidence: InjuryRiskConfidence;
  riskScore?: number;
  why: string[];
  modifiableDrivers: string[];
  recommendation: string[];
}

export interface InjuryRiskInput {
  acuteWorkloadSpike?: boolean | null;
  acwr?: number | null;
  lowReadinessState?: boolean | null;
  negativeDeltaZ?: boolean | null;
  poorRecoveryMarkers?: boolean | null;
  highVolatility?: boolean | null;
  repeatedWarningDays?: number | null;
  sorenessPainFlag?: boolean | null;
  gpsHighSpeedSpike?: boolean | null;
}

function yes(v: boolean | null | undefined): boolean {
  return v === true;
}

function n(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function buildInjuryRiskDecision(input: InjuryRiskInput): InjuryRiskDecision {
  const acwr = n(input.acwr);
  const repeatedWarningDays = n(input.repeatedWarningDays) ?? 0;

  const acuteWorkloadSpike = yes(input.acuteWorkloadSpike);
  const elevatedAcwr = typeof acwr === "number" && acwr >= 1.3;
  const lowReadinessState = yes(input.lowReadinessState);
  const negativeDeltaZ = yes(input.negativeDeltaZ);
  const poorRecoveryMarkers = yes(input.poorRecoveryMarkers);
  const highVolatility = yes(input.highVolatility);
  const repeatedWarnings = repeatedWarningDays >= 2;
  const sorenessPainFlag = yes(input.sorenessPainFlag);
  const gpsHighSpeedSpike = yes(input.gpsHighSpeedSpike);

  let riskScore = 0;
  if (acuteWorkloadSpike) riskScore += 2;
  if (elevatedAcwr) riskScore += 2;
  if (lowReadinessState) riskScore += 1;
  if (negativeDeltaZ) riskScore += 1;
  if (poorRecoveryMarkers) riskScore += 2;
  if (highVolatility) riskScore += 1;
  if (repeatedWarnings) riskScore += 2;
  if (sorenessPainFlag) riskScore += 2;
  if (gpsHighSpeedSpike) riskScore += 1;

  const why: string[] = [];
  const modifiableDrivers: string[] = [];
  const recommendation: string[] = [];

  if (acuteWorkloadSpike || elevatedAcwr || gpsHighSpeedSpike) {
    why.push("Training load has increased rapidly over a short period");
    modifiableDrivers.push("Rapid load progression");
  }
  if ((lowReadinessState || negativeDeltaZ) && poorRecoveryMarkers) {
    why.push("Fatigue remains elevated while recovery markers are below normal");
    modifiableDrivers.push("Incomplete recovery");
  } else if (lowReadinessState || negativeDeltaZ) {
    why.push("Readiness trend is below the player's recent baseline");
    modifiableDrivers.push("Readiness trend");
  }
  if (repeatedWarnings || highVolatility) {
    why.push("Recent warning signs have been repeated across multiple days");
    modifiableDrivers.push("Repeated warning pattern");
  }
  if (riskScore >= 5) {
    why.push("This pattern suggests elevated injury risk if full loading continues");
  }

  let injuryRiskLevel: InjuryRiskLevel = "LOW";
  if (riskScore >= 7) injuryRiskLevel = "HIGH";
  else if (riskScore >= 4) injuryRiskLevel = "MODERATE";

  if (injuryRiskLevel === "HIGH") {
    recommendation.push("Reduce high-speed exposure for this session");
    recommendation.push("Avoid maximal or repeated explosive work");
    recommendation.push("Modify total training load and prioritize recovery");
    recommendation.push("Reassess readiness tomorrow before full loading");
  } else if (injuryRiskLevel === "MODERATE") {
    recommendation.push("Control high-speed and explosive volume");
    recommendation.push("Modify total training load and monitor response");
    recommendation.push("Prioritize recovery work and reassess tomorrow");
  } else {
    recommendation.push("Maintain planned load with normal monitoring");
  }

  const presentSignals = [
    acuteWorkloadSpike,
    elevatedAcwr,
    lowReadinessState,
    negativeDeltaZ,
    poorRecoveryMarkers,
    highVolatility,
    repeatedWarnings,
    sorenessPainFlag,
    gpsHighSpeedSpike,
  ].filter(Boolean).length;

  let confidence: InjuryRiskConfidence = "medium";
  if (presentSignals <= 2) confidence = "low";
  if (presentSignals >= 4) confidence = "high";

  return {
    injuryRiskLevel,
    confidence,
    riskScore,
    why: why.slice(0, 4),
    modifiableDrivers: Array.from(new Set(modifiableDrivers)),
    recommendation: recommendation.slice(0, 4),
  };
}

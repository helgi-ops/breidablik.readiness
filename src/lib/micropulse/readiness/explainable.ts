export type ExplainableAthleteState = "GREEN" | "YELLOW" | "RED" | "GRAY";
export type ExplainableSessionMode = "full" | "modified" | "recovery" | "pending";
export type ExplainableConfidence = "low" | "medium" | "high";

export interface ExplainableReadinessDecision {
  athleteState: ExplainableAthleteState;
  sessionMode: ExplainableSessionMode;
  confidence: ExplainableConfidence;
  score?: number;
  why: string[];
  coachAction: string[];
  riskFactors: string[];
  supportingMetrics?: {
    zScore?: number;
    deltaZ?: number;
    acwr?: number;
    sleepScore?: number;
    hrvChangePct?: number;
    volatility?: number;
  };
}

export interface ExplainableReadinessInput {
  athleteState: ExplainableAthleteState;
  sessionMode: ExplainableSessionMode;
  score?: number | null;
  zScore?: number | null;
  deltaZ?: number | null;
  acwr?: number | null;
  sleepScore?: number | null;
  hrvChangePct?: number | null;
  volatility?: number | null;
}

function num(v: number | null | undefined): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function buildExplainableReadinessDecision(input: ExplainableReadinessInput): ExplainableReadinessDecision {
  const zScore = num(input.zScore);
  const deltaZ = num(input.deltaZ);
  const acwr = num(input.acwr);
  const sleepScore = num(input.sleepScore);
  const hrvChangePct = num(input.hrvChangePct);
  const volatility = num(input.volatility);
  const score = num(input.score);

  const riskFactors: string[] = [];
  const why: string[] = [];
  const coachAction: string[] = [];

  const lowZ = typeof zScore === "number" && zScore <= -1.0;
  const dropZ = typeof deltaZ === "number" && deltaZ <= -0.25;
  const highAcwr = typeof acwr === "number" && acwr >= 1.3;
  const poorSleep = typeof sleepScore === "number" && sleepScore <= 2;
  const hrvSuppressed = typeof hrvChangePct === "number" && hrvChangePct <= -8;
  const highVolatility = typeof volatility === "number" && volatility >= 40;

  if (lowZ || dropZ) {
    riskFactors.push("fatigue_elevated");
    why.push("Fatigue is elevated compared to the player's normal level");
  }
  if (highAcwr) {
    riskFactors.push("acwr_spike");
    why.push("Training load has increased rapidly over the past week");
  }
  if (poorSleep || hrvSuppressed) {
    riskFactors.push("recovery_markers_suppressed");
    why.push("Recovery markers suggest incomplete recovery");
  }
  if (highVolatility) {
    riskFactors.push("high_volatility");
    why.push("Recent responses have been inconsistent, suggesting unstable readiness");
  }

  if (!why.length) {
    if (input.athleteState === "GREEN") why.push("Readiness profile is stable and well recovered");
    else if (input.athleteState === "YELLOW") why.push("Some fatigue indicators are present today");
    else if (input.athleteState === "RED") why.push("Significant fatigue indicators are present today");
    else why.push("Readiness check-in is incomplete");
  }

  if (input.athleteState === "GREEN") {
    coachAction.push("Keep normal training load and prioritize quality execution");
    if (highVolatility) coachAction.push("Monitor first block response before progressing volume");
  } else if (input.athleteState === "YELLOW") {
    coachAction.push("Modify load: reduce volume and extend rest intervals");
    coachAction.push("Keep technical quality high and avoid unnecessary fatigue cost");
  } else if (input.athleteState === "RED") {
    coachAction.push("Shift to recovery emphasis and avoid high-output loading");
    coachAction.push("Use low-cost work and reassess readiness before full loading");
  } else {
    coachAction.push("Collect missing readiness inputs before confirming full session load");
  }

  const availableInputs = [zScore, deltaZ, acwr, sleepScore, hrvChangePct, volatility].filter(
    (v) => typeof v === "number"
  ).length;
  const riskCount = riskFactors.length;

  let confidence: ExplainableConfidence = "medium";
  if (availableInputs <= 2) confidence = "low";
  else if (availableInputs >= 4 && riskCount >= 2) confidence = "high";
  else if (availableInputs >= 4 && riskCount === 0 && input.athleteState === "GREEN") confidence = "high";
  else if (availableInputs <= 3 && riskCount <= 1) confidence = "medium";

  if (input.athleteState === "RED" && riskCount <= 1) confidence = "low";
  if (input.athleteState === "GRAY") confidence = "low";

  return {
    athleteState: input.athleteState,
    sessionMode: input.sessionMode,
    confidence,
    score,
    why: why.slice(0, 3),
    coachAction: coachAction.slice(0, 3),
    riskFactors,
    supportingMetrics: {
      zScore,
      deltaZ,
      acwr,
      sleepScore,
      hrvChangePct,
      volatility,
    },
  };
}

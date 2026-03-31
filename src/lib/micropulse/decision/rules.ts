import { CONFIDENCE_PENALTIES, DECISION_STATE_SEVERITY, DECISION_THRESHOLDS, DEFAULT_SESSION_MODE_BY_STATE } from "./constants";
import {
  calculateConfidenceBand,
  clampNumber,
  dedupeEnumArray,
  dedupeStringArray,
  normalizeFatigue,
  normalizeRecovery,
  normalizeSleepQuality,
  normalizeSoreness,
  normalizeStress,
} from "./helpers";
import { buildCoachSummary, buildExplanationFactors, buildPlayerSummary } from "./explanations";
import type {
  DecisionConfidence,
  DecisionConstraint,
  DecisionFocus,
  DecisionInput,
  DecisionState,
  RiskFlag,
  SessionMode,
  TrainingRecommendation,
} from "./types";

type EngineState = {
  baseState: DecisionState;
  finalState: DecisionState;
  riskFlags: RiskFlag[];
  matchedRules: string[];
  constraints: DecisionConstraint[];
  focus: DecisionFocus[];
  loadAdjustment: number | null;
  confidence: DecisionConfidence;
  requiresManualReview: boolean;
  usedLightAteFallback: boolean;
  derived: Record<string, unknown>;
};

function severity(state: DecisionState): number {
  return DECISION_STATE_SEVERITY[state];
}

function maxState(a: DecisionState, b: DecisionState): DecisionState {
  return severity(b) > severity(a) ? b : a;
}

function resolveBaseState(input: DecisionInput): { state: DecisionState; usedLightAteFallback: boolean } {
  if (input.readinessState) return { state: input.readinessState, usedLightAteFallback: false };
  if (input.lightAteState) return { state: input.lightAteState, usedLightAteFallback: true };
  if (input.injuryRiskState) return { state: input.injuryRiskState, usedLightAteFallback: false };
  return { state: "GRAY", usedLightAteFallback: false };
}

function resolveRiskFlags(input: DecisionInput): { flags: RiskFlag[]; derived: Record<string, unknown> } {
  const flags: RiskFlag[] = [];
  const sorenessBand = normalizeSoreness(input.wellness?.soreness);
  const recoveryBand = normalizeRecovery(input.wellness?.recovery);
  const sleepBand = normalizeSleepQuality(input.wellness?.sleepQuality);
  const fatigueBand = normalizeFatigue(input.wellness?.fatigue);
  const stressBand = normalizeStress(input.wellness?.stress);
  const acwr = input.load?.acwr ?? null;
  const loadDelta = input.load?.loadDeltaVs7dAvg ?? null;
  const hsr = input.load?.highSpeedRunningDistance ?? null;
  const band6 = input.load?.velocityBand6Distance ?? null;
  const accelTotal = input.load?.totalAccelerations ?? null;
  const decelTotal = input.load?.totalDecelerations ?? null;
  const density = input.load?.accelDecelDensity ?? null;

  if (input.load?.missing) flags.push("missing_load_data");
  if (input.wellness?.missing) flags.push("missing_wellness");
  if (input.context?.manuallyFlagged) flags.push("manual_review");

  if (typeof acwr === "number" && acwr >= DECISION_THRESHOLDS.ACWR_HIGH) flags.push("high_acwr", "acwr_spike");
  else if (typeof acwr === "number" && acwr >= DECISION_THRESHOLDS.ACWR_ELEVATED) flags.push("acwr_spike");

  if (typeof loadDelta === "number" && loadDelta >= DECISION_THRESHOLDS.LOAD_SPIKE_MODERATE) flags.push("load_spike");
  if (typeof loadDelta === "number" && loadDelta <= DECISION_THRESHOLDS.LOAD_DROP_HIGH) flags.push("recent_load_drop");

  if (sorenessBand === "poor") flags.push("high_soreness");
  if (sleepBand === "poor") flags.push("low_sleep");
  if (recoveryBand === "poor") flags.push("low_recovery");
  if (fatigueBand === "poor") flags.push("high_fatigue");
  if (stressBand === "poor") flags.push("high_stress");

  if (input.injuryRiskState === "YELLOW" || (input.injuryRiskScore ?? 0) >= DECISION_THRESHOLDS.MODERATE_RISK_SCORE) {
    flags.push("injury_risk_elevated");
  }
  if (input.injuryRiskState === "RED" || (input.injuryRiskScore ?? 0) >= DECISION_THRESHOLDS.HIGH_RISK_SCORE) {
    flags.push("injury_risk_high");
  }

  if (
    (typeof hsr === "number" && hsr > 0 && typeof input.load?.rolling7dAvg === "number" && hsr >= input.load.rolling7dAvg * 0.35) ||
    (typeof band6 === "number" && band6 > 150)
  ) {
    flags.push("high_hsr_exposure");
  }

  if (
    (typeof accelTotal === "number" && accelTotal >= 70) ||
    (typeof decelTotal === "number" && decelTotal >= 70) ||
    (typeof density === "number" && density >= 1.2)
  ) {
    flags.push("high_accel_decel_exposure", "high_mechanical_load");
  }

  return {
    flags: dedupeEnumArray(flags),
    derived: {
      sorenessBand,
      recoveryBand,
      sleepBand,
      fatigueBand,
    },
  };
}

function resolveFinalState(input: DecisionInput, baseState: DecisionState, riskFlags: RiskFlag[], matchedRules: string[]): DecisionState {
  const majorWellnessHits = [
    riskFlags.includes("high_soreness"),
    riskFlags.includes("low_sleep"),
    riskFlags.includes("low_recovery"),
    riskFlags.includes("high_fatigue"),
  ].filter(Boolean).length;
  const hasLoadSpike = riskFlags.includes("load_spike") || riskFlags.includes("high_acwr");
  const highInjury = riskFlags.includes("injury_risk_high");
  const elevatedInjury = riskFlags.includes("injury_risk_elevated");
  const manualReview = riskFlags.includes("manual_review");
  const missingCore = riskFlags.includes("missing_load_data") && riskFlags.includes("missing_wellness");

  let finalState = baseState;

  if (
    input.readinessState === "RED" ||
    input.injuryRiskState === "RED" ||
    manualReview ||
    (riskFlags.includes("high_acwr") && riskFlags.includes("high_soreness")) ||
    (riskFlags.includes("high_acwr") && riskFlags.includes("low_recovery")) ||
    (majorWellnessHits >= 2 && hasLoadSpike) ||
    (highInjury && riskFlags.includes("low_recovery"))
  ) {
    matchedRules.push("force_red");
    return "RED";
  }

  if (
    baseState === "YELLOW" ||
    input.injuryRiskState === "YELLOW" ||
    riskFlags.includes("acwr_spike") ||
    riskFlags.includes("load_spike") ||
    riskFlags.includes("high_soreness") ||
    riskFlags.includes("low_sleep") ||
    riskFlags.includes("high_fatigue") ||
    riskFlags.includes("high_stress") ||
    riskFlags.includes("recent_load_drop") ||
    riskFlags.includes("missing_load_data") ||
    riskFlags.includes("missing_wellness") ||
    elevatedInjury ||
    riskFlags.includes("high_accel_decel_exposure")
  ) {
    finalState = maxState(finalState, "YELLOW");
    matchedRules.push("force_yellow");
  }

  if (missingCore && !input.readinessState && !input.lightAteState && !input.injuryRiskState) {
    matchedRules.push("insufficient_core_inputs");
    finalState = "GRAY";
  }

  return finalState;
}

function resolveSessionMode(finalState: DecisionState): SessionMode {
  return DEFAULT_SESSION_MODE_BY_STATE[finalState];
}

function resolveLoadAdjustment(finalState: DecisionState, riskFlags: RiskFlag[]): number | null {
  if (finalState === "GRAY") return null;
  if (finalState === "RED") return -0.5;
  if (finalState === "GREEN" && riskFlags.length === 0) return 0;
  if (finalState === "GREEN") return -0.1;

  const severeYellow =
    riskFlags.includes("high_acwr") ||
    (riskFlags.includes("high_soreness") && riskFlags.includes("low_recovery")) ||
    riskFlags.includes("high_accel_decel_exposure");
  if (severeYellow) return -0.35;
  if (riskFlags.includes("acwr_spike") || riskFlags.includes("high_soreness")) return -0.25;
  return -0.15;
}

function resolveConstraints(finalState: DecisionState, riskFlags: RiskFlag[]): DecisionConstraint[] {
  const constraints: DecisionConstraint[] = [];
  if (finalState === "RED") constraints.push("recovery_only");
  if (riskFlags.includes("high_hsr_exposure") || riskFlags.includes("high_acwr")) constraints.push("limit_high_speed_running");
  if (riskFlags.includes("high_accel_decel_exposure")) constraints.push("limit_accel_decel_density");
  if (riskFlags.includes("high_soreness") || riskFlags.includes("low_recovery")) constraints.push("avoid_eccentric_overload");
  if (finalState === "YELLOW") constraints.push("limit_total_volume", "avoid_max_intensity");
  if (finalState === "GRAY") constraints.push("technique_only");

  const deduped = dedupeEnumArray(constraints);
  return deduped.length ? deduped : ["no_change"];
}

function resolveFocus(finalState: DecisionState, riskFlags: RiskFlag[]): DecisionFocus[] {
  const focus: DecisionFocus[] = [];
  if (finalState === "GREEN") focus.push("full_training");
  if (finalState === "YELLOW") focus.push("reduced_volume", "monitor_closely", "individual_modification");
  if (finalState === "RED") focus.push("recovery_regeneration", "mobility_and_activation", "sleep_recovery_emphasis");
  if (finalState === "GRAY") focus.push("monitor_closely", "individual_modification");
  if (riskFlags.includes("high_accel_decel_exposure") || riskFlags.includes("high_hsr_exposure")) focus.push("low_mechanical_stress");
  if (riskFlags.includes("high_fatigue")) focus.push("neural_reset");
  return dedupeEnumArray(focus).slice(0, 3);
}

function resolveConfidence(input: DecisionInput, args: {
  finalState: DecisionState;
  riskFlags: RiskFlag[];
  usedLightAteFallback: boolean;
  requiresManualReview: boolean;
}): DecisionConfidence {
  let score = 0.9;
  const reasons: string[] = [];
  const hasReadiness = !!input.readinessState || typeof input.readinessScore === "number";
  const hasInjuryRisk = !!input.injuryRiskState || typeof input.injuryRiskScore === "number";
  const hasWellness = !input.wellness?.missing;
  const hasLoad = !input.load?.missing;

  if (hasReadiness) reasons.push("Readiness input available.");
  else reasons.push("Readiness state unavailable.");
  if (hasInjuryRisk) reasons.push("Injury risk input available.");
  if (hasWellness) reasons.push("Wellness input available.");
  else {
    score -= CONFIDENCE_PENALTIES.MISSING_WELLNESS;
    reasons.push("Confidence reduced because wellness input is missing.");
  }
  if (hasLoad) reasons.push("Load input available.");
  else {
    score -= CONFIDENCE_PENALTIES.MISSING_LOAD;
    reasons.push("Confidence reduced because load input is missing.");
  }
  if (args.usedLightAteFallback) {
    score -= CONFIDENCE_PENALTIES.FALLBACK_ONLY;
    reasons.push("Decision uses Light ATE fallback.");
  }
  if (args.requiresManualReview) {
    score -= CONFIDENCE_PENALTIES.MANUAL_REVIEW;
    reasons.push("Manual review is required.");
  }
  if (args.finalState === "GRAY") {
    score -= CONFIDENCE_PENALTIES.GRAY_STATE;
    reasons.push("Confidence reduced because the recommendation is pending.");
  }
  if (
    input.readinessState === "GREEN" &&
    (input.injuryRiskState === "RED" || input.injuryRiskState === "YELLOW")
  ) {
    score -= CONFIDENCE_PENALTIES.CONFLICTING_INPUTS;
    reasons.push("Inputs are not fully aligned across systems.");
  }

  if (!hasLoad && hasReadiness && hasWellness) score = Math.min(score, DECISION_THRESHOLDS.MIN_CONFIDENCE_WITHOUT_LOAD);
  if (!hasWellness && hasReadiness && hasLoad) score = Math.min(score, DECISION_THRESHOLDS.MIN_CONFIDENCE_WITHOUT_WELLNESS);

  const clamped = clampNumber(score, 0.2, 0.95);
  return {
    score: clamped,
    band: calculateConfidenceBand(clamped),
    reasons: dedupeStringArray(reasons),
  };
}

function buildDebugPayload(input: DecisionInput, state: EngineState): TrainingRecommendation["debug"] {
  return {
    inputStates: {
      readinessState: input.readinessState ?? null,
      injuryRiskState: input.injuryRiskState ?? null,
      lightAteState: input.lightAteState ?? null,
    },
    derived: state.derived,
    matchedRules: state.matchedRules,
  };
}

export function buildTrainingRecommendation(input: DecisionInput): TrainingRecommendation {
  const { state: baseState, usedLightAteFallback } = resolveBaseState(input);
  const matchedRules: string[] = [];
  const { flags: riskFlags, derived } = resolveRiskFlags(input);
  const finalState = resolveFinalState(input, baseState, riskFlags, matchedRules);
  const sessionMode = resolveSessionMode(finalState);
  const loadAdjustment = resolveLoadAdjustment(finalState, riskFlags);
  const constraints = resolveConstraints(finalState, riskFlags);
  const focus = resolveFocus(finalState, riskFlags);
  const requiresManualReview = riskFlags.includes("manual_review") || finalState === "GRAY";
  const confidence = resolveConfidence(input, {
    finalState,
    riskFlags,
    usedLightAteFallback,
    requiresManualReview,
  });
  const explanationFactors = buildExplanationFactors({
    input,
    finalState,
    matchedRules,
    riskFlags,
  });

  const state: EngineState = {
    baseState,
    finalState,
    riskFlags,
    matchedRules,
    constraints,
    focus,
    loadAdjustment,
    confidence,
    requiresManualReview,
    usedLightAteFallback,
    derived: {
      ...derived,
      loadDeltaVs7dAvg: input.load?.loadDeltaVs7dAvg ?? null,
      acwr: input.load?.acwr ?? null,
      sessionType: input.context?.sessionType ?? null,
    },
  };

  return {
    state: finalState,
    sessionMode,
    loadAdjustment,
    constraints,
    focus,
    riskFlags,
    explanationFactors,
    confidence,
    coachSummary: buildCoachSummary({
      state: finalState,
      sessionMode,
      topFactors: explanationFactors,
      constraints,
      loadAdjustment,
    }),
    playerSummary: buildPlayerSummary({
      state: finalState,
      topFactors: explanationFactors,
      focus,
    }),
    dataQuality: {
      hasReadiness: !!input.readinessState || typeof input.readinessScore === "number",
      hasInjuryRisk: !!input.injuryRiskState || typeof input.injuryRiskScore === "number",
      hasWellness: !input.wellness?.missing,
      hasLoad: !input.load?.missing,
      usedLightAteFallback,
      requiresManualReview,
    },
    debug: buildDebugPayload(input, state),
  };
}

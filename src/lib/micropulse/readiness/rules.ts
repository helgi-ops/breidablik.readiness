import type { ExplainableReadinessDecision, NormalizedPlayerMonitoringInput } from "./types";

export type ReadinessRuleResult = {
  athleteState: ExplainableReadinessDecision["athleteState"];
  sessionMode: ExplainableReadinessDecision["sessionMode"];
  confidence: ExplainableReadinessDecision["confidence"];
  score?: number;
  riskFactors: string[];
  triggeredRules: string[];
  missingInputs: string[];
  externalLoadExplanations: string[];
  valdExplanations: string[];
};

function hasNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}

function shouldDownweightWhoopLoad(input: NormalizedPlayerMonitoringInput): boolean {
  // If we already have rich team load metrics, WHOOP load should be treated as contextual.
  return (
    hasNumber(input.acwr) ||
    hasNumber(input.sessionRpeLoad) ||
    hasNumber(input.acuteLoad) ||
    hasNumber(input.chronicLoad) ||
    hasNumber(input.highSpeedRunning)
  );
}

function computeCompleteness(input: NormalizedPlayerMonitoringInput): number {
  if (hasNumber(input.dataCompleteness)) return Math.max(0, Math.min(1, input.dataCompleteness as number));
  const checks = [
    hasNumber(input.checkinScore) || hasNumber(input.readinessScore),
    hasNumber(input.zScore),
    hasNumber(input.deltaZ),
    hasNumber(input.sleepScore),
    hasNumber(input.acwr),
    hasNumber(input.volatility),
  ];
  const present = checks.filter(Boolean).length;
  return present / checks.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hasWhoopData(input: NormalizedPlayerMonitoringInput): boolean {
  return input.whoop?.hasWhoopData === true;
}

function adjustConfidence(
  confidence: ReadinessRuleResult["confidence"],
  delta: -1 | 0 | 1
): ReadinessRuleResult["confidence"] {
  if (delta === 0) return confidence;
  if (delta > 0) {
    if (confidence === "low") return "medium";
    if (confidence === "medium") return "high";
    return "high";
  }
  if (confidence === "high") return "medium";
  if (confidence === "medium") return "low";
  return "low";
}

function computeWhoopComposite(input: NormalizedPlayerMonitoringInput): number {
  if (!hasWhoopData(input) || !input.whoop) return 0;
  const overall = input.whoop.overallSupportScore;
  if (hasNumber(overall)) return clamp(overall as number, -1, 1);

  const recovery = input.whoop.recoverySupportScore ?? 0;
  const sleep = input.whoop.sleepSupportScore ?? 0;
  const autonomic = input.whoop.autonomicSupportScore ?? 0;
  const confidence = clamp(input.whoop.confidence ?? 0.4, 0, 1);

  // Fallback weighting scheme if overall support isn't provided.
  return clamp((recovery * 0.45 + sleep * 0.35 + autonomic * 0.2) * confidence, -1, 1);
}

function applyWhoopPositiveSupport(params: {
  input: NormalizedPlayerMonitoringInput;
  triggeredRules: string[];
  riskFactors: string[];
}): { confidenceBias: -1 | 0 | 1; scoreDelta: number } {
  if (!hasWhoopData(params.input) || !params.input.whoop) {
    return { confidenceBias: 0, scoreDelta: 0 };
  }
  const whoop = params.input.whoop;
  const composite = computeWhoopComposite(params.input);
  const recoveryPositive = whoop.recoveryFlag === "positive";
  const sleepPositive = whoop.sleepFlag === "positive";
  const contradictory =
    (whoop.recoveryFlag === "positive" && whoop.sleepFlag === "negative") ||
    (whoop.recoveryFlag === "negative" && whoop.sleepFlag === "positive");

  if (recoveryPositive && sleepPositive && composite >= 0.2) {
    params.triggeredRules.push("WHOOP_POSITIVE_SUPPORT");
    params.riskFactors.push("whoop_positive_support");
    return {
      confidenceBias: whoop.confidence && whoop.confidence >= 0.6 ? 1 : 0,
      scoreDelta: Math.round(clamp(composite, 0, 1) * 4),
    };
  }

  if (contradictory) {
    params.triggeredRules.push("WHOOP_MIXED_SIGNALS");
    return { confidenceBias: -1, scoreDelta: 0 };
  }

  return { confidenceBias: 0, scoreDelta: 0 };
}

function applyWhoopCautionSupport(params: {
  input: NormalizedPlayerMonitoringInput;
  triggeredRules: string[];
  riskFactors: string[];
  mildCautionContext: boolean;
  hasRedRule: boolean;
}): { confidenceBias: -1 | 0 | 1; scoreDelta: number; promoteYellow: boolean } {
  if (!hasWhoopData(params.input) || !params.input.whoop) {
    return { confidenceBias: 0, scoreDelta: 0, promoteYellow: false };
  }
  const whoop = params.input.whoop;
  const recoveryNegative = whoop.recoveryFlag === "negative";
  const sleepNegative = whoop.sleepFlag === "negative";
  const caution = recoveryNegative || sleepNegative;
  if (!caution) return { confidenceBias: 0, scoreDelta: 0, promoteYellow: false };

  params.triggeredRules.push("WHOOP_CAUTION_SUPPORT");
  params.riskFactors.push("whoop_recovery_caution");

  const cautionStrength = clamp(Math.abs(computeWhoopComposite(params.input)), 0, 1);
  const promoteYellow = !params.hasRedRule && params.mildCautionContext && cautionStrength >= 0.25;
  if (promoteYellow) {
    params.triggeredRules.push("YELLOW_WHOOP_CAUTION_SUPPORT");
  }

  return {
    confidenceBias: promoteYellow ? 1 : -1,
    scoreDelta: -Math.round(cautionStrength * 4),
    promoteYellow,
  };
}

function applyWhoopLoadContext(params: {
  input: NormalizedPlayerMonitoringInput;
  triggeredRules: string[];
  hasRichLoadData: boolean;
}): { scoreDelta: number } {
  if (!hasWhoopData(params.input) || !params.input.whoop) return { scoreDelta: 0 };
  const whoop = params.input.whoop;
  if (whoop.loadFlag !== "negative") return { scoreDelta: 0 };

  if (params.hasRichLoadData) {
    params.triggeredRules.push("WHOOP_LOAD_CONTEXT_DOWNWEIGHTED");
    return { scoreDelta: 0 };
  }

  params.triggeredRules.push("WHOOP_LOAD_CONTEXT_ONLY");
  const loadSupport = Math.abs(clamp(whoop.loadSupportScore ?? -0.2, -1, 1));
  return { scoreDelta: -Math.round(loadSupport * 2) };
}

function finalizeResult(params: {
  athleteState: ExplainableReadinessDecision["athleteState"];
  sessionMode: ExplainableReadinessDecision["sessionMode"];
  confidence: ExplainableReadinessDecision["confidence"];
  score?: number;
  riskFactors: string[];
  triggeredRules: string[];
  missingInputs: string[];
  confidenceBias?: -1 | 0 | 1;
  scoreDelta?: number;
  externalLoadExplanations?: string[];
  valdExplanations?: string[];
}): ReadinessRuleResult {
  const scoreAdjusted =
    typeof params.score === "number"
      ? clamp(params.score + (params.scoreDelta ?? 0), 0, 100)
      : params.score;

  return {
    athleteState: params.athleteState,
    sessionMode: params.sessionMode,
    confidence: adjustConfidence(params.confidence, params.confidenceBias ?? 0),
    score: scoreAdjusted,
    riskFactors: Array.from(new Set(params.riskFactors)),
    triggeredRules: Array.from(new Set(params.triggeredRules)),
    missingInputs: params.missingInputs,
    externalLoadExplanations: params.externalLoadExplanations ?? [],
    valdExplanations: params.valdExplanations ?? [],
  };
}

function applyCatapultStateShift(params: {
  athleteState: ExplainableReadinessDecision["athleteState"];
  sessionMode: ExplainableReadinessDecision["sessionMode"];
  input: NormalizedPlayerMonitoringInput;
}): Pick<ReadinessRuleResult, "athleteState" | "sessionMode"> {
  const modifier = params.input.catapultReadinessModifier;
  const signals = params.input.catapultSignals;
  if (!modifier || !signals) {
    return { athleteState: params.athleteState, sessionMode: params.sessionMode };
  }

  const severeContext =
    (typeof params.input.readinessScore === "number" && params.input.readinessScore <= 50) ||
    (typeof params.input.checkinScore === "number" && params.input.checkinScore <= 11) ||
    (typeof params.input.zScore === "number" && params.input.zScore <= -0.8) ||
    (typeof params.input.sleepScore === "number" && params.input.sleepScore <= 2) ||
    params.input.matchCongestion === true ||
    params.input.travelLoad === true ||
    params.input.painFlag === true ||
    params.input.tissueSignal === true;
  const cautionContext =
    severeContext ||
    (typeof params.input.acwr === "number" && params.input.acwr >= 1.15) ||
    (typeof params.input.sorenessScore === "number" && params.input.sorenessScore <= 2) ||
    (typeof params.input.deltaZ === "number" && params.input.deltaZ <= -0.1);

  if (params.athleteState === "RED" || signals.externalLoadState === "unknown") {
    return { athleteState: params.athleteState, sessionMode: params.sessionMode };
  }

  if (params.athleteState === "YELLOW") {
    if (modifier.suggestedStateShift >= 2 && severeContext) {
      return { athleteState: "RED", sessionMode: "recovery" };
    }
    return { athleteState: "YELLOW", sessionMode: "modified" };
  }

  if (params.athleteState === "GREEN") {
    if (modifier.suggestedStateShift >= 2) {
      return cautionContext
        ? { athleteState: "YELLOW", sessionMode: "modified" }
        : { athleteState: "GREEN", sessionMode: "full" };
    }
    if (modifier.suggestedStateShift >= 1 && cautionContext) {
      return { athleteState: "YELLOW", sessionMode: "modified" };
    }
  }

  return { athleteState: params.athleteState, sessionMode: params.sessionMode };
}

export function evaluateReadinessRules(input: NormalizedPlayerMonitoringInput): ReadinessRuleResult {
  const triggeredRules: string[] = [];
  const missingInputs: string[] = [];
  const riskFactors: string[] = [];

  const completeness = computeCompleteness(input);
  const catapultModifier = input.catapultReadinessModifier ?? null;
  const catapultSignals = input.catapultSignals ?? null;
  const catapultExplanations = catapultModifier?.explanations.map((item) => item.message) ?? [];
  const catapultScoreDelta = catapultModifier?.scoreDelta ?? 0;
  const catapultFlags = catapultModifier?.cautionFlags ?? [];
  const valdAdjustment = input.valdReadinessAdjustment ?? null;
  const valdExplanations = valdAdjustment?.explanation ?? [];
  const valdScoreDelta = valdAdjustment?.adjustmentScore ?? 0;
  const valdFlags = valdAdjustment?.flags ?? [];
  if (!hasNumber(input.zScore)) missingInputs.push("zScore");
  if (!hasNumber(input.deltaZ)) missingInputs.push("deltaZ");
  if (!hasNumber(input.acwr)) missingInputs.push("acwr");
  if (!hasNumber(input.sleepScore)) missingInputs.push("sleepScore");
  if (!hasNumber(input.volatility)) missingInputs.push("volatility");
  if (!hasNumber(input.sorenessScore)) missingInputs.push("sorenessScore");
  if (!hasNumber(input.stenScore)) missingInputs.push("stenScore");
  if (!hasNumber(input.readinessScore) && !hasNumber(input.checkinScore)) missingInputs.push("readinessScore");
  if (!input.valdDailySnapshot) missingInputs.push("valdSnapshot");

  if (catapultSignals?.externalLoadState === "elevated") triggeredRules.push("CATAPULT_EXTERNAL_LOAD_ELEVATED");
  if (catapultSignals?.externalLoadState === "high") triggeredRules.push("CATAPULT_EXTERNAL_LOAD_HIGH");
  if (catapultSignals?.externalLoadState === "unknown" && catapultExplanations.length) triggeredRules.push("CATAPULT_EXTERNAL_LOAD_UNKNOWN");
  if (catapultFlags.includes("catapult_hir_spike")) triggeredRules.push("CATAPULT_HIR_SPIKE");
  if (catapultFlags.includes("catapult_decel_spike")) triggeredRules.push("CATAPULT_DECEL_SPIKE");
  if (catapultFlags.includes("catapult_accel_spike")) triggeredRules.push("CATAPULT_ACCEL_SPIKE");
  if (catapultFlags.includes("catapult_player_load_spike")) triggeredRules.push("CATAPULT_PLAYER_LOAD_SPIKE");
  if (catapultFlags.includes("catapult_max_velocity")) triggeredRules.push("CATAPULT_MAX_VELOCITY");
  if (catapultFlags.includes("catapult_band6_exposure")) triggeredRules.push("CATAPULT_SPRINT_EXPOSURE_CAUTION");
  if (valdFlags.includes("vald_neuromuscular_caution")) triggeredRules.push("VALD_NEUROMUSCULAR_CAUTION");
  if (valdFlags.includes("vald_neuromuscular_drop")) triggeredRules.push("VALD_NEUROMUSCULAR_DROP");
  if (valdFlags.includes("vald_missing")) triggeredRules.push("VALD_MISSING");
  riskFactors.push(...catapultFlags, ...valdFlags);

  const lightState = input.lightAteState ?? null;
  if (lightState === "RED") {
    triggeredRules.push("LIGHT_ATE_RED_PRIORITY");
    return finalizeResult({
      athleteState: "RED",
      sessionMode: "recovery",
      confidence: completeness >= 0.5 ? "high" : "medium",
      score: input.readinessScore ?? input.checkinScore,
      riskFactors: ["low_readiness_state", "ate_red_priority", ...catapultFlags, ...valdFlags],
      triggeredRules,
      missingInputs,
      scoreDelta: catapultScoreDelta + valdScoreDelta,
      externalLoadExplanations: catapultExplanations,
      valdExplanations,
    });
  }
  if (lightState === "YELLOW") {
    triggeredRules.push("LIGHT_ATE_YELLOW_PRIORITY");
    const shifted = applyCatapultStateShift({
      athleteState: "YELLOW",
      sessionMode: "modified",
      input,
    });
    return finalizeResult({
      athleteState: shifted.athleteState,
      sessionMode: shifted.sessionMode,
      confidence: completeness >= 0.5 ? "high" : "medium",
      score: input.readinessScore ?? input.checkinScore,
      riskFactors: ["moderate_readiness_state", "ate_yellow_priority", ...catapultFlags, ...valdFlags],
      triggeredRules,
      missingInputs,
      scoreDelta: catapultScoreDelta + valdScoreDelta,
      externalLoadExplanations: catapultExplanations,
      valdExplanations,
    });
  }

  if (completeness < 0.35) {
    triggeredRules.push("GRAY_INSUFFICIENT_INPUT");
    return finalizeResult({
      athleteState: "GRAY",
      sessionMode: "pending",
      confidence: "low",
      score: input.readinessScore ?? input.checkinScore,
      riskFactors: ["insufficient_data", ...catapultFlags, ...valdFlags],
      triggeredRules,
      missingInputs,
      scoreDelta: catapultScoreDelta + valdScoreDelta,
      externalLoadExplanations: catapultExplanations,
      valdExplanations,
    });
  }

  const z = input.zScore;
  const dz = input.deltaZ;
  const acwr = input.acwr;
  const readiness = input.readinessScore ?? input.checkinScore;
  const sleep = input.sleepScore;
  const hrvChange = input.hrvChangePct;
  const vol = input.volatility;
  const sorenessScore = input.sorenessScore;
  const stenScore = input.stenScore;
  const tissueSignal = input.tissueSignal === true;
  const tissueSeverity = input.tissueSeverity ?? null;
  const explicitPainTextFlag = input.explicitPainTextFlag === true;
  const gpsSpike = input.gpsSpike === true;
  const lowReadiness = typeof readiness === "number" && readiness <= 40;
  const fatigueTrendStrong = typeof z === "number" && z <= -1 && typeof dz === "number" && dz <= -0.3;
  const recoverySuppressed = typeof sleep === "number" && sleep <= 2 && typeof hrvChange === "number" && hrvChange <= -8;
  const loadSpike = (typeof acwr === "number" && acwr >= 1.4) || gpsSpike;
  const fatiguePresent = (typeof z === "number" && z <= -0.8) || lowReadiness;
  const lowSorenessCaution = typeof sorenessScore === "number" && sorenessScore <= 2;
  const goodSorenessSignal = typeof sorenessScore === "number" && sorenessScore >= 4;
  const hardRedNeural = input.neuralFatigueLevel === "high";
  const tissueSeverityEscalates = tissueSeverity === "MODERATE" || tissueSeverity === "HIGH";
  const strongPositiveTissueGuardrail =
    typeof z === "number" &&
    z > 1.5 &&
    typeof stenScore === "number" &&
    stenScore >= 8 &&
    goodSorenessSignal &&
    tissueSeverity === "LOW";
  const tissueCombinedStrongRed =
    tissueSignal &&
    (hardRedNeural || fatigueTrendStrong || recoverySuppressed || lowReadiness || (typeof acwr === "number" && acwr >= 1.4));
  const hardRedPain =
    !strongPositiveTissueGuardrail &&
    (input.painFlag === true ||
      (tissueSignal && (tissueSeverityEscalates || lowSorenessCaution || explicitPainTextFlag || tissueCombinedStrongRed)));
  const hardRedFlags = hardRedNeural || hardRedPain;
  const strongReadinessDay =
    typeof z === "number" &&
    z > 1.5 &&
    goodSorenessSignal &&
    !hardRedFlags &&
    !lowReadiness &&
    !fatigueTrendStrong &&
    !recoverySuppressed;

  if (hardRedNeural) {
    triggeredRules.push("RED_NEURAL_PROTECTION");
    riskFactors.push("neural_protection");
  }
  if (hardRedPain) {
    triggeredRules.push("RED_INJURY_PAIN_FLAG");
    riskFactors.push("injury_protection");
  }
  if (tissueSignal && tissueSeverity === "LOW" && !hardRedPain) {
    triggeredRules.push("INFO_TISSUE_LOW_SEVERITY");
    riskFactors.push("tissue_monitor");
  }

  if (fatigueTrendStrong) {
    triggeredRules.push("RED_FATIGUE_TREND");
    riskFactors.push("fatigue_elevated");
  }
  if (recoverySuppressed) {
    triggeredRules.push("RED_RECOVERY_SUPPRESSION");
    riskFactors.push("recovery_suppressed");
  }
  if (loadSpike && fatiguePresent) {
    triggeredRules.push("RED_LOAD_SPIKE_FATIGUE");
    riskFactors.push("load_spike_fatigue");
  }
  if (lowSorenessCaution && (hardRedFlags || fatigueTrendStrong || recoverySuppressed || lowReadiness)) {
    triggeredRules.push("RED_LOW_SORENESS_COMBINED");
    riskFactors.push("low_soreness_caution");
  }

  let whoopConfidenceBias: -1 | 0 | 1 = 0;
  let whoopScoreDelta = 0;
  const hasRichLoadData = shouldDownweightWhoopLoad(input);

  if (triggeredRules.some((r) => r.startsWith("RED_"))) {
    // Preserve hard RED dominance; WHOOP can provide context but cannot erase RED protections.
    const loadPatch = applyWhoopLoadContext({
      input,
      triggeredRules,
      hasRichLoadData,
    });
    return finalizeResult({
      athleteState: "RED",
      sessionMode: "recovery",
      confidence: completeness >= 0.6 ? "high" : "medium",
      score: readiness,
      riskFactors,
      triggeredRules,
      missingInputs,
      scoreDelta: loadPatch.scoreDelta + catapultScoreDelta + valdScoreDelta,
      externalLoadExplanations: catapultExplanations,
      valdExplanations,
    });
  }

  if ((typeof z === "number" && z <= -0.6) || (typeof dz === "number" && dz <= -0.15) || (typeof readiness === "number" && readiness <= 55)) {
    triggeredRules.push("YELLOW_MODERATE_FATIGUE");
    riskFactors.push("moderate_fatigue");
  }
  if (typeof acwr === "number" && acwr >= 1.2) {
    triggeredRules.push("YELLOW_RISING_WORKLOAD");
    riskFactors.push("rising_workload");
  }
  if (lowSorenessCaution) {
    triggeredRules.push("YELLOW_LOW_SORENESS_CAUTION");
    riskFactors.push("low_soreness_caution");
  }
  if (typeof vol === "number" && vol >= 35 && !strongReadinessDay) {
    triggeredRules.push("YELLOW_HIGH_VOLATILITY");
    riskFactors.push("high_volatility");
  }
  if (typeof vol === "number" && vol >= 35 && strongReadinessDay) {
    triggeredRules.push("VOLATILITY_DEEMPHASIZED_STRONG_DAY");
  }

  const mildCautionContext =
    (typeof readiness === "number" && readiness <= 65) ||
    (typeof z === "number" && z <= -0.4) ||
    (typeof dz === "number" && dz <= -0.1) ||
    lowSorenessCaution ||
    (typeof acwr === "number" && acwr >= 1.1);

  const cautionPatch = applyWhoopCautionSupport({
    input,
    triggeredRules,
    riskFactors,
    mildCautionContext,
    hasRedRule: false,
  });
  const positivePatch = applyWhoopPositiveSupport({
    input,
    triggeredRules,
    riskFactors,
  });
  const loadPatch = applyWhoopLoadContext({
    input,
    triggeredRules,
    hasRichLoadData,
  });

  if (positivePatch.confidenceBias === -1 || cautionPatch.confidenceBias === -1) whoopConfidenceBias = -1;
  else if (positivePatch.confidenceBias === 1 || cautionPatch.confidenceBias === 1) whoopConfidenceBias = 1;
  whoopScoreDelta = cautionPatch.scoreDelta + positivePatch.scoreDelta + loadPatch.scoreDelta;

  if (triggeredRules.some((r) => r.startsWith("YELLOW_"))) {
    const shifted = applyCatapultStateShift({
      athleteState: "YELLOW",
      sessionMode: "modified",
      input,
    });
    return finalizeResult({
      athleteState: shifted.athleteState,
      sessionMode: shifted.sessionMode,
      confidence: completeness >= 0.6 ? "medium" : "low",
      score: readiness,
      riskFactors,
      triggeredRules,
      missingInputs,
      confidenceBias: whoopConfidenceBias === -1 ? 0 : whoopConfidenceBias,
      scoreDelta: whoopScoreDelta + catapultScoreDelta + valdScoreDelta,
      externalLoadExplanations: catapultExplanations,
      valdExplanations,
    });
  }

  if (strongReadinessDay) {
    triggeredRules.push("GREEN_STRONG_READINESS_GOOD_SORENESS");
    riskFactors.push("strong_same_day_readiness");
  }

  triggeredRules.push("GREEN_STABLE");
  const shifted = applyCatapultStateShift({
    athleteState: "GREEN",
    sessionMode: "full",
    input,
  });
  return finalizeResult({
    athleteState: shifted.athleteState,
    sessionMode: shifted.sessionMode,
    confidence: strongReadinessDay || completeness >= 0.7 ? "high" : "medium",
    score: readiness,
    riskFactors: riskFactors.length > 0 ? riskFactors : ["stable_profile"],
    triggeredRules,
    missingInputs,
    confidenceBias: whoopConfidenceBias,
    scoreDelta: whoopScoreDelta + catapultScoreDelta + valdScoreDelta,
    externalLoadExplanations: catapultExplanations,
    valdExplanations,
  });
}

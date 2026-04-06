import {
  ATE_BLUEPRINT_BY_MD,
  ATE_BORDERLINE_THRESHOLDS,
  ATE_DEFAULTS,
  ATE_MD_REASON_BY_CONTEXT,
  ATE_READINESS_BANDS,
  ATE_SESSION_INTENT_BY_MD,
} from "./rules";
import type {
  AteAthleteState,
  AteDecisionInput,
  AteDecisionResult,
  AteMdContext,
  AteParameterModifiers,
  AteReasonCode,
  AteSessionIntent,
} from "./types";

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function classifyReadiness(readinessScore?: number | null): AteAthleteState {
  if (typeof readinessScore !== "number" || Number.isNaN(readinessScore)) {
    return ATE_DEFAULTS.fallbackState;
  }

  const score = clampNumber(readinessScore, 0, 100);
  if (score >= ATE_READINESS_BANDS.GREEN_PLUS.min) return "GREEN_PLUS";
  if (score >= ATE_READINESS_BANDS.GREEN.min) return "GREEN";
  if (score >= ATE_READINESS_BANDS.YELLOW.min) return "YELLOW";
  return "RED";
}

export function determineAthleteState(input: AteDecisionInput): AteAthleteState {
  const readinessBasedState = classifyReadiness(input.readinessScore);
  const neuralBand = input.neuralFatigueBand ?? null;
  const yesterdayLoadBand = input.yesterdayLoadBand ?? null;

  if (neuralBand === "VERY_HIGH") {
    return "RED";
  }

  let state = readinessBasedState;

  if (state === "GREEN_PLUS") {
    if (neuralBand === "HIGH") {
      const score = typeof input.readinessScore === "number" ? input.readinessScore : null;
      state = score != null && score <= ATE_BORDERLINE_THRESHOLDS.greenPlusUpperBorderline ? "YELLOW" : "GREEN";
    } else if (neuralBand !== "LOW" && neuralBand !== "MODERATE") {
      state = "GREEN";
    }
  } else if (state === "GREEN" && neuralBand === "HIGH") {
    state = "YELLOW";
  }

  if (state === "GREEN_PLUS" && yesterdayLoadBand === "HIGH") {
    state = "GREEN";
  }

  return state;
}

export function determineSessionIntent(
  mdContext: AteMdContext,
  athleteState: AteAthleteState
): AteSessionIntent {
  if (athleteState === "RED") {
    return "RESET";
  }

  return ATE_SESSION_INTENT_BY_MD[mdContext] ?? "PRIMER";
}

export function determineBlueprintId(
  mdContext: AteMdContext,
  athleteState: AteAthleteState
): string {
  if (athleteState === "RED") return "red_reset_session";
  return ATE_BLUEPRINT_BY_MD[mdContext] ?? ATE_DEFAULTS.fallbackBlueprintId;
}

function mergeModifierNumbers(
  base: AteParameterModifiers,
  key: "reduceSetsBy" | "tightenVelocityLossBy" | "extendRestSeconds",
  amount: number
): AteParameterModifiers {
  const current = base[key] ?? 0;
  return {
    ...base,
    [key]: Number((current + amount).toFixed(3)),
  };
}

export function determineParameterModifiers(
  input: AteDecisionInput,
  athleteState: AteAthleteState,
  mdContext: AteMdContext
): AteParameterModifiers {
  let modifiers: AteParameterModifiers = {};

  if (athleteState === "YELLOW") {
    modifiers = mergeModifierNumbers(modifiers, "reduceSetsBy", 1);
    modifiers = mergeModifierNumbers(modifiers, "tightenVelocityLossBy", 0.02);
    modifiers = mergeModifierNumbers(modifiers, "extendRestSeconds", 30);
  }

  if (athleteState === "RED") {
    modifiers = mergeModifierNumbers(modifiers, "extendRestSeconds", 60);
    modifiers.disableContrast = true;
    modifiers.replaceBallisticPrimer = true;
  }

  if (input.neuralFatigueBand === "HIGH") {
    modifiers = mergeModifierNumbers(modifiers, "tightenVelocityLossBy", 0.02);
    modifiers = mergeModifierNumbers(modifiers, "extendRestSeconds", 30);
  }

  if (input.neuralFatigueBand === "VERY_HIGH") {
    modifiers = mergeModifierNumbers(modifiers, "extendRestSeconds", 60);
    modifiers.disableContrast = true;
    modifiers.replaceBallisticPrimer = true;
  }

  if (input.yesterdayLoadBand === "HIGH") {
    modifiers = mergeModifierNumbers(modifiers, "reduceSetsBy", 1);
  }

  if (mdContext === "MD1") {
    // MD1 should only preserve freshness in v1.
    modifiers = {
      ...modifiers,
      reduceSetsBy: Math.max(0, modifiers.reduceSetsBy ?? 0),
      tightenVelocityLossBy: Math.max(0, modifiers.tightenVelocityLossBy ?? 0),
      extendRestSeconds: Math.max(0, modifiers.extendRestSeconds ?? 0),
    };
  }

  return modifiers;
}

function collectDecisionReasons(params: {
  input: AteDecisionInput;
  state: AteAthleteState;
  blueprintId: string;
  modifiers: AteParameterModifiers;
}): AteReasonCode[] {
  const reasons: AteReasonCode[] = [];
  const { input, state, blueprintId, modifiers } = params;
  const readiness = input.readinessScore;

  if (typeof readiness === "number" && readiness >= ATE_READINESS_BANDS.GREEN_PLUS.min) reasons.push("HIGH_READINESS");
  else if (typeof readiness === "number" && readiness >= ATE_READINESS_BANDS.GREEN.min) reasons.push("NORMAL_READINESS");
  else if (typeof readiness === "number" && readiness >= ATE_READINESS_BANDS.YELLOW.min) reasons.push("LOW_READINESS");
  else reasons.push("VERY_LOW_READINESS");

  if (input.neuralFatigueBand === "LOW") reasons.push("LOW_NEURAL_FATIGUE");
  else if (input.neuralFatigueBand === "MODERATE") reasons.push("MODERATE_NEURAL_FATIGUE");
  else if (input.neuralFatigueBand === "HIGH") reasons.push("HIGH_NEURAL_FATIGUE");
  else if (input.neuralFatigueBand === "VERY_HIGH") reasons.push("VERY_HIGH_NEURAL_FATIGUE");

  if (input.yesterdayLoadBand === "HIGH") reasons.push("HIGH_YESTERDAY_LOAD", "FORCE_COST_REDUCED");

  const mdReason = ATE_MD_REASON_BY_CONTEXT[input.mdContext];
  if (mdReason) reasons.push(mdReason);

  if (state === "RED") reasons.push("RED_RESET_DAY");

  if (modifiers.tightenVelocityLossBy && modifiers.tightenVelocityLossBy > 0) reasons.push("VL_TIGHTENED");
  if (modifiers.extendRestSeconds && modifiers.extendRestSeconds > 0) reasons.push("REST_EXTENDED");
  if (modifiers.disableContrast) reasons.push("CONTRAST_DISABLED");
  if (modifiers.replaceBallisticPrimer) reasons.push("BALLISTIC_REPLACED");

  if (blueprintId === ATE_DEFAULTS.fallbackBlueprintId && !ATE_BLUEPRINT_BY_MD[input.mdContext]) {
    reasons.push("DEFAULT_BLUEPRINT");
  }

  return unique(reasons);
}

function collectRiskFlags(input: AteDecisionInput, state: AteAthleteState): string[] {
  const flags: string[] = [];
  if (state === "RED") flags.push("RED_STATE");
  if (input.neuralFatigueBand === "VERY_HIGH") flags.push("VERY_HIGH_NEURAL_FATIGUE");
  if (input.neuralFatigueBand === "HIGH") flags.push("HIGH_NEURAL_FATIGUE");
  if (input.yesterdayLoadBand === "HIGH") flags.push("HIGH_YESTERDAY_LOAD");
  if (typeof input.readinessScore === "number" && input.readinessScore < 40) flags.push("READINESS_BELOW_40");
  if (input.mdContext === "MD1" && state !== "RED") flags.push("MD1_FRESHNESS_GUARD");
  return unique(flags);
}

export function buildAteDecision(
  input: AteDecisionInput
): AteDecisionResult {
  const athleteState = determineAthleteState(input);
  const sessionIntent = determineSessionIntent(input.mdContext, athleteState);
  const blueprintId = determineBlueprintId(input.mdContext, athleteState);
  const parameterModifiers = determineParameterModifiers(input, athleteState, input.mdContext);
  const decisionReasons = collectDecisionReasons({
    input,
    state: athleteState,
    blueprintId,
    modifiers: parameterModifiers,
  });

  return {
    athleteState,
    sessionIntent,
    blueprintId,
    decisionReasons,
    parameterModifiers,
    riskFlags: collectRiskFlags(input, athleteState),
  };
}

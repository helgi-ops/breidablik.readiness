import {
  LIGHT_ATE_DEFAULTS,
  LIGHT_ATE_LIMITS,
  LIGHT_ATE_MD_VL_CAPS,
  LIGHT_ATE_STATE_THRESHOLDS,
} from "./rules";
import type {
  LightAteAthleteState,
  LightAteDecisionInput,
  LightAteDecisionResult,
  LightAteMdContext,
  LightAteModifiers,
  LightAteReasonCode,
} from "./types";

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function classifyReadiness(readinessScore?: number | null): LightAteAthleteState {
  if (typeof readinessScore !== "number" || Number.isNaN(readinessScore)) {
    return LIGHT_ATE_DEFAULTS.fallbackState;
  }

  const score = clamp(readinessScore, 0, 100);
  if (score >= LIGHT_ATE_STATE_THRESHOLDS.GREEN_PLUS.min) return "GREEN_PLUS";
  if (score >= LIGHT_ATE_STATE_THRESHOLDS.GREEN.min) return "GREEN";
  if (score >= LIGHT_ATE_STATE_THRESHOLDS.YELLOW.min) return "YELLOW";
  return "RED";
}

export function determineLightAteState(
  input: LightAteDecisionInput
): LightAteAthleteState {
  const readinessState = classifyReadiness(input.readinessScore);
  const neural = input.neuralFatigueBand ?? null;
  const yesterday = input.yesterdayLoadBand ?? null;

  if (neural === "VERY_HIGH") return "RED";

  let state = readinessState;

  if (state === "GREEN_PLUS") {
    if (neural === "HIGH") state = "GREEN";
    if (yesterday === "HIGH") state = "GREEN";
    if (neural !== "LOW" && neural !== "MODERATE" && neural !== "HIGH") state = "GREEN";
  } else if (state === "GREEN" && neural === "HIGH") {
    state = "YELLOW";
  }

  return state;
}

export function determineTemplateId(
  mdContext: LightAteMdContext,
  athleteState: LightAteAthleteState
): string {
  if (athleteState === "RED") return "red_reset_session";
  if (mdContext === "MD4" || mdContext === "MD5") return "md4_force_contrast";
  if (mdContext === "MD3") return "md3_lower_force";
  if (mdContext === "MD2") return "md2_power_primer";
  if (mdContext === "MD1") return "md1_neural_primer";
  // MD+1 should bias recovery without forcing RED/reset unless state is actually RED.
  if (mdContext === "MD_PLUS_1") return "md1_neural_primer";
  if (mdContext === "OFF") return "red_reset_session";
  if (mdContext === "UNKNOWN") return LIGHT_ATE_DEFAULTS.fallbackTemplateId;
  return LIGHT_ATE_DEFAULTS.fallbackTemplateId;
}

function countParameterModifiers(modifiers: LightAteModifiers): number {
  let count = 0;
  if (typeof modifiers.velocityLossCap === "number") count += 1;
  if (typeof modifiers.reduceSetsBy === "number" && modifiers.reduceSetsBy > 0) count += 1;
  if (typeof modifiers.extendRestSeconds === "number" && modifiers.extendRestSeconds > 0) count += 1;
  return count;
}

function countStructuralChanges(modifiers: LightAteModifiers): number {
  let count = 0;
  if (modifiers.disableContrast) count += 1;
  if (modifiers.replaceBallisticPrimer) count += 1;
  return count;
}

function normalizeModifiers(
  input: LightAteDecisionInput,
  athleteState: LightAteAthleteState,
  modifiers: LightAteModifiers
): LightAteModifiers {
  const normalized: LightAteModifiers = {
    ...modifiers,
  };

  if (typeof normalized.velocityLossCap === "number") {
    normalized.velocityLossCap = Math.max(
      LIGHT_ATE_LIMITS.minVelocityLossCap,
      Number(normalized.velocityLossCap.toFixed(3))
    );
  }
  if (typeof normalized.reduceSetsBy === "number") {
    normalized.reduceSetsBy = Math.min(
      1,
      Math.max(LIGHT_ATE_LIMITS.minSafeSetsReduction, Math.floor(normalized.reduceSetsBy))
    );
  }
  if (typeof normalized.extendRestSeconds === "number") {
    normalized.extendRestSeconds = clamp(
      Math.round(normalized.extendRestSeconds),
      0,
      LIGHT_ATE_LIMITS.maxRestExtensionSeconds
    );
  }

  if (input.mdContext === "MD1") {
    normalized.disableContrast = true;
    normalized.replaceBallisticPrimer = false;
    normalized.velocityLossCap = LIGHT_ATE_MD_VL_CAPS.MD1;
  }

  if (countParameterModifiers(normalized) > LIGHT_ATE_LIMITS.maxParameterModifiers) {
    // Keep only the three most important non-structural controls.
    normalized.reduceSetsBy = normalized.reduceSetsBy && normalized.reduceSetsBy > 0 ? normalized.reduceSetsBy : undefined;
    normalized.extendRestSeconds = normalized.extendRestSeconds && normalized.extendRestSeconds > 0 ? normalized.extendRestSeconds : undefined;
    normalized.velocityLossCap = typeof normalized.velocityLossCap === "number" ? normalized.velocityLossCap : undefined;
  }

  const structuralCount = countStructuralChanges(normalized);
  if (structuralCount > LIGHT_ATE_LIMITS.maxStructuralChanges) {
    // Keep structural changes conservative in v1: prefer disabling contrast.
    normalized.replaceBallisticPrimer = false;
  }

  return normalized;
}

export function determineLightAteModifiers(
  input: LightAteDecisionInput,
  athleteState: LightAteAthleteState
): LightAteModifiers {
  const mdCap = LIGHT_ATE_MD_VL_CAPS[input.mdContext];
  const modifiers: LightAteModifiers = {};

  if (mdCap != null) modifiers.velocityLossCap = mdCap;

  if (athleteState === "YELLOW") {
    modifiers.reduceSetsBy = 1;
    modifiers.extendRestSeconds = 30;
  }

  if (athleteState === "RED") {
    modifiers.disableContrast = true;
    modifiers.replaceBallisticPrimer = false;
    modifiers.extendRestSeconds = 60;
  }

  if (input.neuralFatigueBand === "HIGH") {
    modifiers.extendRestSeconds = (modifiers.extendRestSeconds ?? 0) + 30;
  }

  if (input.yesterdayLoadBand === "HIGH" && athleteState === "YELLOW") {
    modifiers.reduceSetsBy = 1;
  }

  return normalizeModifiers(input, athleteState, modifiers);
}

function buildReasons(params: {
  input: LightAteDecisionInput;
  athleteState: LightAteAthleteState;
  templateId: string;
  modifiers: LightAteModifiers;
}): LightAteReasonCode[] {
  const reasons: LightAteReasonCode[] = [];
  const { input, athleteState, templateId, modifiers } = params;
  const readiness = input.readinessScore;

  if (typeof readiness === "number" && readiness >= LIGHT_ATE_STATE_THRESHOLDS.GREEN_PLUS.min) reasons.push("HIGH_READINESS");
  else if (typeof readiness === "number" && readiness >= LIGHT_ATE_STATE_THRESHOLDS.GREEN.min) reasons.push("NORMAL_READINESS");
  else if (typeof readiness === "number" && readiness >= LIGHT_ATE_STATE_THRESHOLDS.YELLOW.min) reasons.push("LOW_READINESS");
  else reasons.push("VERY_LOW_READINESS");

  if (input.neuralFatigueBand === "LOW") reasons.push("LOW_NEURAL_FATIGUE");
  else if (input.neuralFatigueBand === "MODERATE") reasons.push("MODERATE_NEURAL_FATIGUE");
  else if (input.neuralFatigueBand === "HIGH") reasons.push("HIGH_NEURAL_FATIGUE");
  else if (input.neuralFatigueBand === "VERY_HIGH") reasons.push("VERY_HIGH_NEURAL_FATIGUE");

  if (input.yesterdayLoadBand === "HIGH") reasons.push("HIGH_YESTERDAY_LOAD");
  reasons.push("MD_TEMPLATE_SELECTED");

  if (athleteState === "YELLOW" || athleteState === "RED") reasons.push("STATE_REDUCED");
  if (typeof modifiers.velocityLossCap === "number") reasons.push("VL_CAPPED_BY_MD");
  if (modifiers.disableContrast) reasons.push("CONTRAST_DISABLED");
  if (modifiers.replaceBallisticPrimer) reasons.push("PRIMER_REPLACED");
  if (typeof modifiers.extendRestSeconds === "number" && modifiers.extendRestSeconds > 0) reasons.push("REST_EXTENDED");
  if (templateId === LIGHT_ATE_DEFAULTS.fallbackTemplateId && input.mdContext === "UNKNOWN") reasons.push("DEFAULT_TEMPLATE");

  return unique(reasons);
}

function buildRiskFlags(input: LightAteDecisionInput, athleteState: LightAteAthleteState): string[] {
  const flags: string[] = [];
  if (athleteState === "RED") flags.push("RED_STATE");
  if (input.neuralFatigueBand === "VERY_HIGH") flags.push("VERY_HIGH_NEURAL_FATIGUE");
  if (input.neuralFatigueBand === "HIGH") flags.push("HIGH_NEURAL_FATIGUE");
  if (input.yesterdayLoadBand === "HIGH") flags.push("HIGH_YESTERDAY_LOAD");
  if (input.mdContext === "MD1") flags.push("MD1_FRESHNESS_PROTECTION");
  return unique(flags);
}

export function buildLightAteDecision(
  input: LightAteDecisionInput
): LightAteDecisionResult {
  const athleteState = determineLightAteState(input);
  const templateId = determineTemplateId(input.mdContext, athleteState);
  const modifiers = determineLightAteModifiers(input, athleteState);
  const reasons = buildReasons({
    input,
    athleteState,
    templateId,
    modifiers,
  });

  return {
    templateId,
    athleteState,
    modifiers,
    reasons,
    riskFlags: buildRiskFlags(input, athleteState),
  };
}

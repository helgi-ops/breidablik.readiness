import { DEFAULT_EXERCISE_MAP, DEFAULT_NODE_MAP } from "./defaults";
import { BLUEPRINTS } from "./schema";
import { resolveTrainingGraph } from "./resolver";
import { buildAteDecision } from "../ate/decision";
import { buildLightAteDecision } from "../lightAte/decision";
import { buildMicrodoseAteDecisionContract, mapTemplateIdToTemplateLabel } from "../lightAte/contract";
import { buildAteDecisionPanelViewModel } from "../lightAte/panel";
import { buildIsoPrescription } from "../isometrics/engine";
import type {
  AteDecisionInput,
  AteDecisionResult,
  AteParameterModifiers
} from "../ate/types";
import type {
  LightAteDecisionInput,
  LightAteDecisionResult,
} from "../lightAte/types";
import type { MicrodoseAteDecisionContract } from "../lightAte/contract";
import type { AteDecisionPanelViewModel } from "../lightAte/panel";
import type {
  AthleteState,
  ExerciseDefinition,
  MdContext,
  ResolvedSession,
  ResolvedNode,
  ResolverInput,
  RestPrescription,
  SetRepPrescription,
  VelocityPrescription,
  TrainingBlueprint,
} from "./types";

export type NeuralFatigueBand = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";
export type YesterdayLoadBand = "LOW" | "MODERATE" | "HIGH";
export type DailyTrainingGraphResult = { ok: true; resolvedSession: ResolvedSession } | { ok: false; reason: string };
export type GraphParameterModifiers = {
  velocityLossCap?: number | null;
  reduceSetsBy?: number;
  tightenVelocityLossBy?: number;
  extendRestSeconds?: number;
  disableContrast?: boolean;
  replaceBallisticPrimer?: boolean;
};

export function getBlueprintById(id: string | null | undefined): TrainingBlueprint | null {
  const key = String(id ?? "").trim();
  if (!key) return null;
  return BLUEPRINTS[key] ?? null;
}

export function normalizeAthleteState(value: string | null | undefined): AthleteState | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return null;

  if (v === "GREEN_PLUS" || v === "GREEN+" || v === "GREEN PLUS") return "GREEN_PLUS";
  if (v === "GREEN") return "GREEN";
  if (v === "YELLOW" || v === "AMBER") return "YELLOW";
  if (v === "RED") return "RED";

  return null;
}

export function normalizeMdContext(value: string | null | undefined): MdContext | null {
  const raw = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!raw) return null;

  const normalized = raw.replace("–", "-");

  if (normalized === "OFF" || normalized === "REST" || normalized === "DAYOFF" || normalized === "DAY_OFF") return "OFF";
  if (normalized === "UNKNOWN") return "UNKNOWN";
  if (normalized === "MD") return "MD1";
  if (normalized === "MD+1" || normalized === "MD_PLUS_1") return "MD_PLUS_1";
  if (normalized === "MD-1") return "MD1";
  if (normalized === "MD-2") return "MD2";
  if (normalized === "MD-3") return "MD3";
  if (normalized === "MD-4") return "MD4";
  if (normalized === "MD-5") return "MD5";
  if (normalized === "MD1") return "MD1";
  if (normalized === "MD2") return "MD2";
  if (normalized === "MD3") return "MD3";
  if (normalized === "MD4") return "MD4";
  if (normalized === "MD5") return "MD5";

  return null;
}

export function normalizeNeuralFatigueBand(value: string | null | undefined): NeuralFatigueBand | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v === "LOW") return "LOW";
  if (v === "MODERATE") return "MODERATE";
  if (v === "HIGH") return "HIGH";
  if (v === "VERY_HIGH" || v === "VERY HIGH" || v === "CRITICAL") return "VERY_HIGH";
  if (v === "RISING") return "MODERATE";
  if (v === "STABLE") return "LOW";
  return null;
}

export function normalizeYesterdayLoadBand(value: string | null | undefined): YesterdayLoadBand | null {
  const v = String(value ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v === "LOW") return "LOW";
  if (v === "MODERATE") return "MODERATE";
  if (v === "HIGH") return "HIGH";
  return null;
}

export function blueprintIdFromContext(params: {
  mdContext: MdContext | null;
  athleteState: AthleteState | null;
}): string | null {
  if (!params.athleteState || !params.mdContext) return null;
  if (params.athleteState === "RED" || params.mdContext === "OFF") return "red_reset_session";
  if (params.mdContext === "UNKNOWN") return "md2_power_primer";
  if (params.mdContext === "MD3") return "md3_lower_force";
  if (params.mdContext === "MD2") return "md2_power_primer";
  if (params.mdContext === "MD1" || params.mdContext === "MD_PLUS_1" || params.mdContext === "MD4" || params.mdContext === "MD5") {
    return "md1_neural_primer";
  }
  return null;
}

export function safeBuildGraphResult(input: {
  blueprintId: string;
  athleteState: AthleteState;
  mdContext: MdContext;
  readinessScore?: number | null;
  neuralFatigueBand?: ResolverInput["neuralFatigueBand"];
  yesterdayLoadBand?: ResolverInput["yesterdayLoadBand"];
  parameterModifiers?: GraphParameterModifiers | null;
}): DailyTrainingGraphResult {
  const blueprint = getBlueprintById(input.blueprintId);
  if (!blueprint) {
    return { ok: false, reason: `Blueprint not found: ${input.blueprintId}` };
  }

  try {
    const resolvedSession = resolveTrainingGraph({
      blueprint,
      nodeMap: DEFAULT_NODE_MAP,
      exerciseMap: DEFAULT_EXERCISE_MAP,
      athleteState: input.athleteState,
      mdContext: input.mdContext,
      readinessScore: input.readinessScore ?? null,
      neuralFatigueBand: input.neuralFatigueBand ?? null,
      yesterdayLoadBand: input.yesterdayLoadBand ?? null,
    });

    const adjustedSession = applyGraphParameterModifiersToSession(resolvedSession, input.parameterModifiers ?? null);
    const isoAdjustedSession = applyIsoPrescriptionsToSession(adjustedSession, DEFAULT_EXERCISE_MAP);
    return { ok: true, resolvedSession: isoAdjustedSession };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Graph resolver failed";
    return { ok: false, reason: message };
  }
}

function isIsometricExercise(exercise?: ExerciseDefinition | null): boolean {
  if (!exercise) return false;
  if (exercise.category === "isometric") return true;
  return exercise.id.includes("_iso") || exercise.id === "iso_mid_thigh_pull";
}

export function applyIsoPrescriptionsToSession(
  resolvedSession: ResolvedSession,
  exerciseMap: Record<string, ExerciseDefinition>
): ResolvedSession {
  const nodes = resolvedSession.nodes.map((node) => {
    const selectedExerciseIds = node.selectedExercises.flatMap((slot) => slot.selectedExerciseIds);
    const isoExerciseIds = selectedExerciseIds.filter((exerciseId) => isIsometricExercise(exerciseMap[exerciseId]));
    if (!isoExerciseIds.length) return node;

    const isoPrescriptions: Record<string, ReturnType<typeof buildIsoPrescription>> = {};
    for (const exerciseId of isoExerciseIds) {
      isoPrescriptions[exerciseId] = buildIsoPrescription({
        athleteState: resolvedSession.athleteState,
        mdContext: resolvedSession.mdContext,
        nodeType: node.nodeType,
        sessionIntent: resolvedSession.intent,
        exerciseId,
      });
    }

    return {
      ...node,
      isoPrescriptions,
    };
  });

  return {
    ...resolvedSession,
    nodes,
  };
}

function reduceSetRepVolume(setRep: SetRepPrescription | null, count: number): SetRepPrescription | null {
  if (!setRep || count <= 0) return setRep;
  const next: SetRepPrescription = { ...setRep };
  const minSafeSets = 1;

  if (typeof next.fixedSets === "number") {
    next.fixedSets = Math.max(minSafeSets, next.fixedSets - count);
  }
  if (typeof next.setsMax === "number") {
    next.setsMax = Math.max(minSafeSets, next.setsMax - count);
  }
  if (typeof next.setsMin === "number") {
    const max = typeof next.setsMax === "number" ? next.setsMax : next.setsMin;
    next.setsMin = Math.max(minSafeSets, Math.min(max, next.setsMin - count));
  }

  return next;
}

function tightenVelocityLossCap(velocity: VelocityPrescription | null, delta: number): VelocityPrescription | null {
  if (!velocity || delta <= 0 || typeof velocity.velocityLossCap !== "number") return velocity;
  return {
    ...velocity,
    velocityLossCap: Math.max(0.03, Number((velocity.velocityLossCap - delta).toFixed(3))),
  };
}

function clampVelocityLossCap(velocity: VelocityPrescription | null, cap: number): VelocityPrescription | null {
  if (!velocity || typeof cap !== "number" || cap <= 0) return velocity;
  if (typeof velocity.velocityLossCap !== "number") {
    return {
      ...velocity,
      velocityLossCap: Number(cap.toFixed(3)),
    };
  }

  return {
    ...velocity,
    velocityLossCap: Math.min(velocity.velocityLossCap, Number(cap.toFixed(3))),
  };
}

function extendRest(rest: RestPrescription | null, extraSeconds: number): RestPrescription | null {
  if (extraSeconds <= 0) return rest;
  const next: RestPrescription = { ...(rest ?? {}) };
  if (typeof next.fixedBetweenSetSeconds === "number") {
    next.fixedBetweenSetSeconds += extraSeconds;
    return next;
  }
  if (typeof next.betweenSetSecondsMin === "number") next.betweenSetSecondsMin += extraSeconds;
  else next.betweenSetSecondsMin = 60 + extraSeconds;
  if (typeof next.betweenSetSecondsMax === "number") next.betweenSetSecondsMax += extraSeconds;
  else next.betweenSetSecondsMax = next.betweenSetSecondsMin + 30;
  return next;
}

function isRestExtensionEligibleNode(nodeType: ResolvedNode["nodeType"]): boolean {
  return (
    nodeType === "primer_ballistic" ||
    nodeType === "primer_light" ||
    nodeType === "main_force_contrast" ||
    nodeType === "main_force"
  );
}

function applyGraphModifiersToNode(node: ResolvedNode, modifiers: GraphParameterModifiers): ResolvedNode {
  const next: ResolvedNode = {
    ...node,
    selectedExercises: node.selectedExercises.map((slot) => ({
      ...slot,
      selectedExerciseIds: [...slot.selectedExerciseIds],
    })),
    setRep: node.setRep ? { ...node.setRep } : null,
    velocity: node.velocity ? { ...node.velocity } : null,
    rest: node.rest ? { ...node.rest } : null,
    notes: [...(node.notes ?? [])],
    reasons: [...(node.reasons ?? [])],
  };

  if (typeof modifiers.reduceSetsBy === "number" && modifiers.reduceSetsBy > 0) {
    next.setRep = reduceSetRepVolume(next.setRep, modifiers.reduceSetsBy);
  }

  if (typeof modifiers.tightenVelocityLossBy === "number" && modifiers.tightenVelocityLossBy > 0) {
    next.velocity = tightenVelocityLossCap(next.velocity, modifiers.tightenVelocityLossBy);
  }

  if (typeof modifiers.velocityLossCap === "number" && modifiers.velocityLossCap > 0) {
    next.velocity = clampVelocityLossCap(next.velocity, modifiers.velocityLossCap);
  }

  if (
    typeof modifiers.extendRestSeconds === "number" &&
    modifiers.extendRestSeconds > 0 &&
    isRestExtensionEligibleNode(next.nodeType)
  ) {
    next.rest = extendRest(next.rest, modifiers.extendRestSeconds);
  }

  if (modifiers.disableContrast && next.nodeType === "main_force_contrast") {
    next.status = "disabled";
    next.selectedExercises = next.selectedExercises.map((slot) => ({
      ...slot,
      selectedExerciseIds: [],
    }));
    next.notes = Array.from(new Set([...next.notes, "Contrast work disabled by ATE freshness guard."]));
    next.reasons = Array.from(new Set([...next.reasons, "NODE_DISABLED"]));
  }

  if (modifiers.replaceBallisticPrimer && next.nodeType === "primer_ballistic") {
    next.nodeType = "primer_light";
    next.nodeId = "primer_light";
    next.label = "Light Primer";
    next.selectedExercises = next.selectedExercises.map((slot) => ({
      ...slot,
      selectedExerciseIds: [],
    }));
    next.velocity = null;
    next.notes = Array.from(new Set([...next.notes, "Ballistic primer replaced by ATE."]));
    next.reasons = Array.from(new Set([...next.reasons, "NODE_REPLACED"]));
    if (next.status === "disabled") {
      next.status = "replaced";
    }
  }

  return next;
}

export function applyAteParameterModifiersToSession(
  resolvedSession: ResolvedSession,
  modifiers?: AteParameterModifiers | null
): ResolvedSession {
  return applyGraphParameterModifiersToSession(resolvedSession, modifiers ?? null);
}

export function applyGraphParameterModifiersToSession(
  resolvedSession: ResolvedSession,
  modifiers?: GraphParameterModifiers | null
): ResolvedSession {
  if (!modifiers) return resolvedSession;

  const hasAny =
    (typeof modifiers.velocityLossCap === "number" && modifiers.velocityLossCap > 0) ||
    (typeof modifiers.reduceSetsBy === "number" && modifiers.reduceSetsBy > 0) ||
    (typeof modifiers.tightenVelocityLossBy === "number" && modifiers.tightenVelocityLossBy > 0) ||
    (typeof modifiers.extendRestSeconds === "number" && modifiers.extendRestSeconds > 0) ||
    modifiers.disableContrast === true ||
    modifiers.replaceBallisticPrimer === true;
  if (!hasAny) return resolvedSession;

  const nodes = resolvedSession.nodes.map((node) => applyGraphModifiersToNode(node, modifiers));
  const sessionReasons = Array.from(new Set(nodes.flatMap((node) => node.reasons)));
  return {
    ...resolvedSession,
    nodes,
    sessionReasons,
  };
}

export function buildDailyTrainingGraphFromAte(
  input: AteDecisionInput
): DailyTrainingGraphResult & { ateDecision: AteDecisionResult } {
  const ateDecision = buildAteDecision(input);
  const graph = safeBuildGraphResult({
    blueprintId: ateDecision.blueprintId,
    athleteState: ateDecision.athleteState,
    mdContext: input.mdContext,
    readinessScore: input.readinessScore ?? null,
    neuralFatigueBand: input.neuralFatigueBand ?? null,
    yesterdayLoadBand: input.yesterdayLoadBand ?? null,
    parameterModifiers: ateDecision.parameterModifiers,
  });

  return {
    ...graph,
    ateDecision,
  };
}

export function mapTemplateIdToBlueprintId(templateId: string): string {
  const key = String(templateId ?? "").trim();
  if (!key) return "md2_power_primer";
  if (key === "md4_force_contrast") {
    // TODO: map this to a dedicated md4 graph blueprint once built.
    return "md3_lower_force";
  }
  if (key === "md3_lower_force") return "md3_lower_force";
  if (key === "md2_power_primer") return "md2_power_primer";
  if (key === "md1_neural_primer") return "md1_neural_primer";
  if (key === "red_reset_session") return "red_reset_session";
  return "md2_power_primer";
}

export function buildDailyTrainingGraphFromLightAte(
  input: LightAteDecisionInput
): DailyTrainingGraphResult & {
  lightAteDecision: LightAteDecisionResult;
  microdoseAteDecisionContract: MicrodoseAteDecisionContract;
  ateDecisionPanel: AteDecisionPanelViewModel;
} {
  const lightAteDecision = buildLightAteDecision(input);
  const blueprintId = mapTemplateIdToBlueprintId(lightAteDecision.templateId);

  const graph = safeBuildGraphResult({
    blueprintId,
    athleteState: lightAteDecision.athleteState,
    mdContext: input.mdContext,
    readinessScore: input.readinessScore ?? null,
    neuralFatigueBand: input.neuralFatigueBand ?? null,
    yesterdayLoadBand: input.yesterdayLoadBand ?? null,
    parameterModifiers: lightAteDecision.modifiers,
  });
  const microdoseAteDecisionContract = buildMicrodoseAteDecisionContract({
    lightAteDecision,
    templateLabel: mapTemplateIdToTemplateLabel(lightAteDecision.templateId),
    mdContext: input.mdContext,
    sessionIntent: graph.ok ? graph.resolvedSession.intent : null,
  });
  const ateDecisionPanel = buildAteDecisionPanelViewModel(microdoseAteDecisionContract);

  return {
    ...graph,
    lightAteDecision,
    microdoseAteDecisionContract,
    ateDecisionPanel,
  };
}

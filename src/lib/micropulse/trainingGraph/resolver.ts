import {
  NODE_DEFINITIONS,
  VELOCITY_LOSS_LIMITS_BY_MD,
} from "./schema";
import type {
  AthleteState,
  MdContext,
  NodeExerciseSlot,
  NodeParameterProfile,
  NodeStatus,
  ResolverInput,
  ResolvedNode,
  ResolvedSession,
  RestPrescription,
  RuleReasonCode,
  SetRepPrescription,
  TrainingNodeDefinition,
  VelocityPrescription,
} from "./types";

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function toInt(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.round(value);
}

function mergeSetRep(base?: SetRepPrescription, override?: SetRepPrescription): SetRepPrescription | undefined {
  if (!base && !override) return undefined;
  return {
    ...(base ?? {}),
    ...(override ?? {}),
  };
}

function mergeVelocity(
  base?: VelocityPrescription | null,
  override?: VelocityPrescription | null
): VelocityPrescription | null | undefined {
  if (override === null) return null;
  if (base === null && !override) return null;
  if (!base && !override) return undefined;
  return {
    ...(base ?? {}),
    ...(override ?? {}),
  } as VelocityPrescription;
}

function mergeRest(base?: RestPrescription | null, override?: RestPrescription | null): RestPrescription | null | undefined {
  if (override === null) return null;
  if (base === null && !override) return null;
  if (!base && !override) return undefined;
  return {
    ...(base ?? {}),
    ...(override ?? {}),
  };
}

export function flattenNotes(...noteSets: Array<string[] | undefined>): string[] {
  const rows = noteSets.flatMap((set) => set ?? []).map((n) => n.trim()).filter(Boolean);
  return unique(rows);
}

export function mergeProfiles(base?: NodeParameterProfile, override?: Partial<NodeParameterProfile>): NodeParameterProfile {
  const out: NodeParameterProfile = {
    status: override?.status ?? base?.status,
    setRep: mergeSetRep(base?.setRep, override?.setRep),
    velocity: mergeVelocity(base?.velocity, override?.velocity),
    rest: mergeRest(base?.rest, override?.rest),
    notes: flattenNotes(base?.notes, override?.notes),
  };
  if (!out.notes?.length) delete out.notes;
  return out;
}

export function clampVelocityLossCap(
  profile: NodeParameterProfile,
  mdContext: MdContext
): { profile: NodeParameterProfile; reasons: RuleReasonCode[] } {
  const reasons: RuleReasonCode[] = [];
  const mdCap = VELOCITY_LOSS_LIMITS_BY_MD[mdContext];
  if (!profile.velocity || mdCap == null) {
    return { profile, reasons };
  }

  const current = profile.velocity.velocityLossCap;
  if (typeof current === "number" && current > mdCap) {
    profile.velocity = {
      ...profile.velocity,
      velocityLossCap: mdCap,
    };
    reasons.push("MD_VL_CAP", "VELOCITY_CLAMPED");
  }

  return { profile, reasons };
}

function reduceSetRepVolume(
  setRep: SetRepPrescription | undefined,
  count: number,
  minSafeSets: number
): { setRep: SetRepPrescription | undefined; reduced: boolean } {
  if (!setRep || count <= 0) return { setRep, reduced: false };

  let reduced = false;
  const next = { ...setRep };

  if (typeof next.fixedSets === "number") {
    const current = toInt(next.fixedSets) ?? minSafeSets;
    const updated = Math.max(minSafeSets, current - count);
    reduced = updated !== current;
    next.fixedSets = updated;
  }

  if (typeof next.setsMax === "number") {
    const current = toInt(next.setsMax) ?? minSafeSets;
    const updated = Math.max(minSafeSets, current - count);
    reduced = reduced || updated !== current;
    next.setsMax = updated;
  }

  if (typeof next.setsMin === "number") {
    const current = toInt(next.setsMin) ?? minSafeSets;
    const setsMax = typeof next.setsMax === "number" ? next.setsMax : current;
    const updated = Math.max(minSafeSets, Math.min(setsMax, current - count));
    reduced = reduced || updated !== current;
    next.setsMin = updated;
  }

  return { setRep: next, reduced };
}

function extendRest(rest: RestPrescription | null | undefined, extraSeconds: number): RestPrescription {
  const next = { ...(rest ?? {}) };
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

function tightenVelocityCap(velocity: VelocityPrescription | null | undefined, delta: number): VelocityPrescription | null | undefined {
  if (!velocity) return velocity;
  if (typeof velocity.velocityLossCap !== "number") return velocity;
  return {
    ...velocity,
    velocityLossCap: Math.max(0.03, Number((velocity.velocityLossCap - delta).toFixed(3))),
  };
}

function isForceOrPrimerNode(nodeType: TrainingNodeDefinition["type"]): boolean {
  return nodeType === "primer_ballistic" || nodeType === "main_force_contrast" || nodeType === "main_force";
}

export function applyFatigueAdjustments(
  profile: NodeParameterProfile,
  input: ResolverInput,
  node: TrainingNodeDefinition
): { profile: NodeParameterProfile; reasons: RuleReasonCode[] } {
  const reasons: RuleReasonCode[] = [];
  const next: NodeParameterProfile = {
    ...profile,
    setRep: profile.setRep ? { ...profile.setRep } : undefined,
    velocity: profile.velocity ? { ...profile.velocity } : profile.velocity,
    rest: profile.rest ? { ...profile.rest } : profile.rest,
    notes: [...(profile.notes ?? [])],
  };

  if (input.neuralFatigueBand === "HIGH" || input.neuralFatigueBand === "VERY_HIGH") {
    const reduction = reduceSetRepVolume(next.setRep, 1, 1);
    next.setRep = reduction.setRep;
    next.rest = extendRest(next.rest, input.neuralFatigueBand === "VERY_HIGH" ? 60 : 30);
    next.velocity = tightenVelocityCap(next.velocity, input.neuralFatigueBand === "VERY_HIGH" ? 0.05 : 0.02);
    reasons.push("HIGH_NEURAL_FATIGUE");
    if (reduction.reduced) reasons.push("REDUCED_VOLUME");
  }

  if (typeof input.readinessScore === "number" && input.readinessScore < 45 && isForceOrPrimerNode(node.type)) {
    const reduction = reduceSetRepVolume(next.setRep, 1, 1);
    next.setRep = reduction.setRep;
    next.velocity = tightenVelocityCap(next.velocity, 0.02);
    reasons.push("LOW_READINESS");
    if (reduction.reduced) reasons.push("REDUCED_VOLUME");
  }

  if (input.yesterdayLoadBand === "HIGH" && isForceOrPrimerNode(node.type)) {
    const reduction = reduceSetRepVolume(next.setRep, 1, 1);
    next.setRep = reduction.setRep;
    next.rest = extendRest(next.rest, 30);
    reasons.push("HIGH_YESTERDAY_LOAD");
    if (reduction.reduced) reasons.push("REDUCED_VOLUME");
  }

  return {
    profile: {
      ...next,
      notes: flattenNotes(next.notes),
    },
    reasons: unique(reasons),
  };
}

function findNodeByType(input: ResolverInput, nodeType: TrainingNodeDefinition["type"]): TrainingNodeDefinition | null {
  const fromInput = Object.values(input.nodeMap).find((n) => n.type === nodeType);
  if (fromInput) return fromInput;
  const fromDefaults = Object.values(NODE_DEFINITIONS).find((n) => n.type === nodeType);
  return fromDefaults ?? null;
}

function resolveNodeWithStateRules(
  input: ResolverInput,
  rawNode: TrainingNodeDefinition
): { node: TrainingNodeDefinition; statusOverride: NodeStatus | null; reasons: RuleReasonCode[] } {
  const reasons: RuleReasonCode[] = [];

  if (input.athleteState === "RED") {
    reasons.push("STATE_RED");

    if (rawNode.type === "main_force_contrast") {
      if (rawNode.replacementNodeTypeForRed) {
        const replacement = findNodeByType(input, rawNode.replacementNodeTypeForRed);
        if (replacement) {
          reasons.push("NODE_REPLACED");
          return { node: replacement, statusOverride: "replaced", reasons };
        }
      }
      reasons.push("NODE_DISABLED");
      return { node: rawNode, statusOverride: "disabled", reasons };
    }

    if (rawNode.type === "primer_ballistic") {
      const replacementType = rawNode.replacementNodeTypeForRed ?? "primer_light";
      const replacement = findNodeByType(input, replacementType);
      if (replacement) {
        reasons.push("NODE_REPLACED");
        return { node: replacement, statusOverride: "replaced", reasons };
      }
      reasons.push("NODE_DISABLED");
      return { node: rawNode, statusOverride: "disabled", reasons };
    }

    if (rawNode.type === "warmup_neural") {
      const replacement = findNodeByType(input, "warmup_reset");
      if (replacement) {
        reasons.push("NODE_REPLACED");
        return { node: replacement, statusOverride: "replaced", reasons };
      }
    }
  }

  if (input.athleteState === "YELLOW") {
    reasons.push("STATE_YELLOW");
  } else if (input.athleteState === "GREEN") {
    reasons.push("STATE_GREEN");
  } else if (input.athleteState === "GREEN_PLUS") {
    reasons.push("STATE_GREEN_PLUS");
  }

  return { node: rawNode, statusOverride: null, reasons };
}

export function resolveNodeStatus(node: TrainingNodeDefinition, athleteState: AthleteState): NodeStatus {
  const stateStatus = node.stateProfiles[athleteState]?.status;
  if (stateStatus) return stateStatus;
  return node.baseProfile.status ?? "active";
}

export function selectExercisesForSlot(
  slot: NodeExerciseSlot,
  exerciseMap: ResolverInput["exerciseMap"]
): string[] {
  const validPool = slot.exercisePoolIds.filter((id) => {
    const ex = exerciseMap[id];
    if (!ex) return false;

    if (slot.allowedCategories?.length && !slot.allowedCategories.includes(ex.category)) return false;
    if (slot.allowedMovementPatterns?.length && !slot.allowedMovementPatterns.includes(ex.movementPattern)) return false;

    return true;
  });

  if (!validPool.length) return [];

  if (slot.select.mode === "single") {
    return [validPool[0]];
  }

  const min = Math.max(1, slot.select.min ?? 1);
  const max = Math.max(min, slot.select.max ?? min);
  const count = Math.min(max, Math.max(min, validPool.length >= min ? min : validPool.length));
  return validPool.slice(0, count);
}

function enforceContrastRules(
  nodeType: TrainingNodeDefinition["type"],
  athleteState: AthleteState,
  profile: NodeParameterProfile
): { profile: NodeParameterProfile; reasons: RuleReasonCode[] } {
  if (nodeType !== "main_force_contrast" || athleteState !== "GREEN_PLUS") {
    return { profile, reasons: [] };
  }

  const next: NodeParameterProfile = {
    ...profile,
    setRep: profile.setRep ? { ...profile.setRep } : {},
  };
  const reasons: RuleReasonCode[] = [];

  if (!next.setRep) {
    return { profile, reasons };
  }

  if (typeof next.setRep.fixedSets === "number" && next.setRep.fixedSets > 4) {
    next.setRep.fixedSets = 4;
    reasons.push("CONTRAST_LIMIT");
  }
  if (typeof next.setRep.setsMax === "number" && next.setRep.setsMax > 4) {
    next.setRep.setsMax = 4;
    reasons.push("CONTRAST_LIMIT");
  }
  if (typeof next.setRep.repsMax === "number" && next.setRep.repsMax > 3) {
    next.setRep.repsMax = 3;
    reasons.push("CONTRAST_LIMIT");
  }
  if (typeof next.setRep.fixedReps === "number" && next.setRep.fixedReps > 3) {
    next.setRep.fixedReps = 3;
    reasons.push("CONTRAST_LIMIT");
  }

  return { profile: next, reasons: unique(reasons) };
}

function applyYellowVolumeGuard(
  nodeType: TrainingNodeDefinition["type"],
  athleteState: AthleteState,
  profile: NodeParameterProfile
): { profile: NodeParameterProfile; reasons: RuleReasonCode[] } {
  if (athleteState !== "YELLOW") return { profile, reasons: [] };

  const next: NodeParameterProfile = {
    ...profile,
    setRep: profile.setRep ? { ...profile.setRep } : undefined,
  };

  if (nodeType === "primer_ballistic") {
    const reduction = reduceSetRepVolume(next.setRep, 1, 2);
    next.setRep = reduction.setRep;
    return { profile: next, reasons: reduction.reduced ? ["REDUCED_VOLUME"] : [] };
  }

  if (nodeType === "main_force_contrast") {
    next.setRep = {
      ...(next.setRep ?? {}),
      fixedSets: 2,
      repsMin: Math.min(next.setRep?.repsMin ?? 2, 3),
      repsMax: Math.min(next.setRep?.repsMax ?? 3, 3),
    };
    return { profile: next, reasons: ["REDUCED_VOLUME"] };
  }

  return { profile, reasons: [] };
}

function profileToResolved(profile: NodeParameterProfile): {
  setRep: SetRepPrescription | null;
  velocity: VelocityPrescription | null;
  rest: RestPrescription | null;
} {
  return {
    setRep: profile.setRep ?? null,
    velocity: profile.velocity ?? null,
    rest: profile.rest ?? null,
  };
}

export function resolveTrainingGraph(input: ResolverInput): ResolvedSession {
  const resolvedNodes: ResolvedNode[] = [];
  const sessionReasons: RuleReasonCode[] = [];

  const orderedRefs = [...input.blueprint.nodeRefs].sort((a, b) => a.order - b.order);

  for (const nodeRef of orderedRefs) {
    const rawNode = input.nodeMap[nodeRef.nodeId];
    if (!rawNode) continue;

    const nodeRuleResolution = resolveNodeWithStateRules(input, rawNode);
    const node = nodeRuleResolution.node;

    let profile = mergeProfiles(node.baseProfile, node.stateProfiles[input.athleteState]);
    profile = mergeProfiles(profile, node.mdModifiers?.[input.mdContext]);

    const reasons: RuleReasonCode[] = [...nodeRuleResolution.reasons];

    const status = nodeRuleResolution.statusOverride ?? resolveNodeStatus(node, input.athleteState);

    const mdClamped = clampVelocityLossCap(profile, input.mdContext);
    profile = mdClamped.profile;
    reasons.push(...mdClamped.reasons);

    const yellowGuard = applyYellowVolumeGuard(node.type, input.athleteState, profile);
    profile = yellowGuard.profile;
    reasons.push(...yellowGuard.reasons);

    const fatigueAdjusted = applyFatigueAdjustments(profile, input, node);
    profile = fatigueAdjusted.profile;
    reasons.push(...fatigueAdjusted.reasons);

    const contrastApplied = enforceContrastRules(node.type, input.athleteState, profile);
    profile = contrastApplied.profile;
    reasons.push(...contrastApplied.reasons);

    const finalStatus: NodeStatus = status === "disabled" || profile.status === "disabled" ? "disabled" : status;

    const selectedExercises = node.exerciseSlots.map((slot) => ({
      slotId: slot.slotId,
      selectedExerciseIds: finalStatus === "disabled" ? [] : selectExercisesForSlot(slot, input.exerciseMap),
    }));

    if (finalStatus === "disabled") {
      reasons.push("NODE_DISABLED");
    }

    if (!reasons.length) reasons.push("DEFAULT_RULE");

    const flattened = profileToResolved(profile);

    resolvedNodes.push({
      nodeId: node.id,
      nodeType: node.type,
      label: node.label,
      order: nodeRef.order,
      status: finalStatus,
      selectedExercises,
      setRep: flattened.setRep,
      velocity: flattened.velocity,
      rest: flattened.rest,
      notes: flattenNotes(profile.notes, node.hardRules),
      reasons: unique(reasons),
    });
  }

  for (const node of resolvedNodes) {
    sessionReasons.push(...node.reasons);
  }

  return {
    blueprintId: input.blueprint.id,
    blueprintTitle: input.blueprint.title,
    athleteState: input.athleteState,
    mdContext: input.mdContext,
    intent: input.blueprint.intent,
    nodes: resolvedNodes,
    sessionReasons: unique(sessionReasons),
  };
}

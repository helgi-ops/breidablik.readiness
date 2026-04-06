import {
  BLUEPRINTS,
  EXERCISE_LIBRARY,
  NODE_DEFINITIONS,
  VELOCITY_LOSS_LIMITS_BY_MD,
  VELOCITY_ZONES,
} from "./schema";
import type {
  AthleteState,
  MdContext,
  ResolverInput,
  TrainingBlueprint,
  TrainingNodeDefinition,
  ExerciseDefinition,
} from "./types";

export const DEFAULT_BLUEPRINTS = BLUEPRINTS;
export const DEFAULT_NODE_MAP: Record<string, TrainingNodeDefinition> = NODE_DEFINITIONS;
export const DEFAULT_EXERCISE_MAP: Record<string, ExerciseDefinition> = EXERCISE_LIBRARY;
export const DEFAULT_MD_VL_CAPS = VELOCITY_LOSS_LIMITS_BY_MD;
export const DEFAULT_VELOCITY_ZONES = VELOCITY_ZONES;

export function getDefaultBlueprintById(id: string): TrainingBlueprint {
  const blueprint = DEFAULT_BLUEPRINTS[id];
  if (!blueprint) {
    return DEFAULT_BLUEPRINTS.md3_lower_force;
  }
  return blueprint;
}

export function buildDefaultResolverInput(params?: {
  blueprintId?: string;
  athleteState?: AthleteState;
  mdContext?: MdContext;
  readinessScore?: number | null;
  neuralFatigueBand?: ResolverInput["neuralFatigueBand"];
  yesterdayLoadBand?: ResolverInput["yesterdayLoadBand"];
}): ResolverInput {
  const athleteState = params?.athleteState ?? "GREEN";
  const mdContext = params?.mdContext ?? "MD3";

  const defaultBlueprintId = athleteState === "RED" ? "red_reset_session" : "md3_lower_force";
  const blueprint = getDefaultBlueprintById(params?.blueprintId ?? defaultBlueprintId);

  return {
    blueprint,
    nodeMap: DEFAULT_NODE_MAP,
    exerciseMap: DEFAULT_EXERCISE_MAP,
    athleteState,
    mdContext,
    readinessScore: params?.readinessScore ?? null,
    neuralFatigueBand: params?.neuralFatigueBand ?? null,
    yesterdayLoadBand: params?.yesterdayLoadBand ?? null,
  };
}

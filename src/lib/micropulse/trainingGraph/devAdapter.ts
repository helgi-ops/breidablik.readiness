import {
  buildDailyTrainingGraphFromLightAte,
  blueprintIdFromContext,
  normalizeAthleteState,
  normalizeMdContext,
  normalizeNeuralFatigueBand,
  normalizeYesterdayLoadBand,
  safeBuildGraphResult,
} from "./integration";
import type { LightAteDecisionResult } from "../lightAte/types";
import type { MicrodoseAteDecisionContract } from "../lightAte/contract";
import type { AteDecisionPanelViewModel } from "../lightAte/panel";
import { flattenResolvedSessionForCoach, flattenResolvedSessionForPlayer } from "./flatten";
import type { CoachResolvedSessionViewModel, PlayerResolvedSessionViewModel } from "./flatten";
import type { ResolvedSession } from "./types";

export interface DevDailySessionAdapterInput {
  blueprintId?: string | null;
  athleteState?: "GREEN_PLUS" | "GREEN" | "YELLOW" | "RED" | null;
  mdContext?: "MD5" | "MD4" | "MD3" | "MD2" | "MD1" | "MD_PLUS_1" | "OFF" | "UNKNOWN" | null;
  readinessScore?: number | null;
  neuralFatigueBand?: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | null;
  yesterdayLoadBand?: "LOW" | "MODERATE" | "HIGH" | null;
}

export interface DevDailySessionAdapterResult {
  mode: "graph" | "legacy";
  coachView?: CoachResolvedSessionViewModel | null;
  playerView?: PlayerResolvedSessionViewModel | null;
  resolvedSession?: ResolvedSession | null;
  lightAteDecision?: LightAteDecisionResult | null;
  microdoseAteDecisionContract?: MicrodoseAteDecisionContract | null;
  ateDecisionPanel?: AteDecisionPanelViewModel | null;
  ateDecision?: LightAteDecisionResult | null;
  fallbackReason?: string | null;
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export function buildDevDailySessionAdapterResult(input: DevDailySessionAdapterInput): DevDailySessionAdapterResult {
  const mdContext = normalizeMdContext(input.mdContext ?? null) ?? "UNKNOWN";

  const athleteState = normalizeAthleteState(input.athleteState ?? null);
  const explicitBlueprintId = asString(input.blueprintId);

  if (explicitBlueprintId && athleteState) {
    const manualGraph = safeBuildGraphResult({
      blueprintId: explicitBlueprintId,
      athleteState,
      mdContext,
      readinessScore: input.readinessScore ?? null,
      neuralFatigueBand: normalizeNeuralFatigueBand(input.neuralFatigueBand ?? null),
      yesterdayLoadBand: normalizeYesterdayLoadBand(input.yesterdayLoadBand ?? null),
    });

    if ("reason" in manualGraph) {
      return {
        mode: "legacy",
        fallbackReason: manualGraph.reason,
      };
    }

    return {
      mode: "graph",
      resolvedSession: manualGraph.resolvedSession,
      coachView: flattenResolvedSessionForCoach(manualGraph.resolvedSession),
      playerView: flattenResolvedSessionForPlayer(manualGraph.resolvedSession),
      lightAteDecision: null,
      microdoseAteDecisionContract: null,
      ateDecisionPanel: null,
      ateDecision: null,
      fallbackReason: null,
    };
  }

  const neuralFatigueBand = normalizeNeuralFatigueBand(input.neuralFatigueBand ?? null);
  const yesterdayLoadBand = normalizeYesterdayLoadBand(input.yesterdayLoadBand ?? null);
  const hasLightAteInputs = typeof input.readinessScore === "number" || neuralFatigueBand != null || yesterdayLoadBand != null;

  if (hasLightAteInputs) {
    const lightAteGraph = buildDailyTrainingGraphFromLightAte({
      mdContext,
      readinessScore: input.readinessScore ?? null,
      neuralFatigueBand,
      yesterdayLoadBand,
    });

    if ("reason" in lightAteGraph) {
      return {
        mode: "legacy",
        fallbackReason: lightAteGraph.reason,
      };
    }

    return {
      mode: "graph",
      resolvedSession: lightAteGraph.resolvedSession,
      coachView: flattenResolvedSessionForCoach(lightAteGraph.resolvedSession),
      playerView: flattenResolvedSessionForPlayer(lightAteGraph.resolvedSession),
      lightAteDecision: lightAteGraph.lightAteDecision,
      microdoseAteDecisionContract: lightAteGraph.microdoseAteDecisionContract,
      ateDecisionPanel: lightAteGraph.ateDecisionPanel,
      ateDecision: lightAteGraph.lightAteDecision,
      fallbackReason: null,
    };
  }

  if (athleteState) {
    const derivedBlueprintId = blueprintIdFromContext({ athleteState, mdContext });
    if (!derivedBlueprintId) {
      return { mode: "legacy", fallbackReason: "No compatible blueprint for this state/context" };
    }

    const legacyGraph = safeBuildGraphResult({
      blueprintId: derivedBlueprintId,
      athleteState,
      mdContext,
      readinessScore: input.readinessScore ?? null,
      neuralFatigueBand,
      yesterdayLoadBand,
    });

    if ("reason" in legacyGraph) {
      return { mode: "legacy", fallbackReason: legacyGraph.reason };
    }

    return {
      mode: "graph",
      resolvedSession: legacyGraph.resolvedSession,
      coachView: flattenResolvedSessionForCoach(legacyGraph.resolvedSession),
      playerView: flattenResolvedSessionForPlayer(legacyGraph.resolvedSession),
      lightAteDecision: null,
      microdoseAteDecisionContract: null,
      ateDecisionPanel: null,
      ateDecision: null,
      fallbackReason: null,
    };
  }

  return {
    mode: "legacy",
    fallbackReason: "Insufficient data for manual or ATE graph path",
  };
}

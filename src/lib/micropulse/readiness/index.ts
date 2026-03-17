import { normalizePlayerMonitoringInput } from "./normalize";
import { explainReadinessCoachActions, explainReadinessWhy } from "./explanations";
import { evaluateReadinessRules } from "./rules";
import type { ExplainableReadinessDecision, NormalizedPlayerMonitoringInput } from "./types";
import type { WhoopFusionFeatures } from "@/lib/micropulse/integrations/whoopFusion";
import type { DailyAthleteSnapshot } from "@/lib/micropulse/domain/snapshot/types";
import { mapSnapshotToReadinessInput } from "@/lib/micropulse/domain/adapters";
import { buildCatapultReadinessContextFromDatabase } from "@/lib/micropulse/externalLoad";
import {
  buildCatapultActionHint,
  buildCatapultConfidenceHint,
  buildCatapultWhyLines,
  mergeActionLines,
  mergeWhyLines,
} from "@/lib/micropulse/externalLoad";

export type { ExplainableReadinessDecision, NormalizedPlayerMonitoringInput } from "./types";
export { runReadinessValidationSuite } from "./validation";

export async function buildExplainableReadinessDecisionWithCatapult(
  input: NormalizedPlayerMonitoringInput,
  options?: { teamId?: string | null }
): Promise<ExplainableReadinessDecision> {
  const shouldHydrateCatapult =
    !input.catapultDailyLoad &&
    !input.catapultBaseline &&
    !input.catapultSignals &&
    !input.catapultReadinessModifier &&
    !!input.playerId &&
    !!input.date;

  if (!shouldHydrateCatapult) {
    return buildExplainableReadinessDecision(input);
  }

  try {
    const catapult = await buildCatapultReadinessContextFromDatabase({
      playerId: input.playerId,
      date: input.date,
      teamId: options?.teamId ?? null,
    });
    return buildExplainableReadinessDecision({
      ...input,
      catapultDailyLoad: catapult.today,
      catapultBaseline: catapult.baseline,
      catapultSignals: catapult.signals,
      externalLoadState: catapult.signals.externalLoadState,
      catapultReadinessModifier: catapult.modifier,
    });
  } catch {
    return buildExplainableReadinessDecision(input);
  }
}

export function buildExplainableReadinessDecisionFromSnapshot(args: {
  snapshot: DailyAthleteSnapshot;
  playerName?: string | null;
  readinessScore?: number | null;
  checkinScore?: number | null;
  lightAteState?: "GREEN" | "YELLOW" | "RED" | "GRAY" | null;
  whoopFeatures?: Partial<WhoopFusionFeatures> | null;
}): ExplainableReadinessDecision {
  return buildExplainableReadinessDecision(
    mapSnapshotToReadinessInput({
      snapshot: args.snapshot,
      playerName: args.playerName,
      readinessScore: args.readinessScore,
      checkinScore: args.checkinScore,
      lightAteState: args.lightAteState ?? null,
      whoopFeatures: args.whoopFeatures ?? null,
    })
  );
}

export function buildExplainableReadinessDecision(input: NormalizedPlayerMonitoringInput): ExplainableReadinessDecision {
  const normalized = normalizePlayerMonitoringInput(input);
  const rules = evaluateReadinessRules(normalized);
  const whoopFeatures: WhoopFusionFeatures | null =
    normalized.whoop?.hasWhoopData === true
      ? {
          hasWhoopData: true,
          recoverySupportScore: normalized.whoop.recoverySupportScore ?? null,
          sleepSupportScore: normalized.whoop.sleepSupportScore ?? null,
          autonomicSupportScore: normalized.whoop.autonomicSupportScore ?? null,
          loadSupportScore: normalized.whoop.loadSupportScore ?? null,
          overallSupportScore: normalized.whoop.overallSupportScore ?? null,
          recoveryFlag: normalized.whoop.recoveryFlag ?? null,
          sleepFlag: normalized.whoop.sleepFlag ?? null,
          autonomicFlag: normalized.whoop.autonomicFlag ?? null,
          loadFlag: normalized.whoop.loadFlag ?? null,
          confidence: normalized.whoop.confidence ?? 0,
          missingFields: normalized.whoop.missingFields ?? [],
          notes: normalized.whoop.notes ?? [],
        }
      : null;
  const catapultWhyLines = buildCatapultWhyLines({
    signals: normalized.catapultSignals ?? null,
    modifier: normalized.catapultReadinessModifier ?? null,
  });
  const catapultActionHint = buildCatapultActionHint({
    externalLoadState: normalized.externalLoadState ?? null,
    signals: normalized.catapultSignals ?? null,
    athleteState: rules.athleteState,
  });
  const catapultConfidenceHint = buildCatapultConfidenceHint({
    signals: normalized.catapultSignals ?? null,
    readinessConfidence: rules.confidence,
  });
  const whyLines = mergeWhyLines({
    baseLines: explainReadinessWhy(rules.triggeredRules, whoopFeatures, rules.externalLoadExplanations),
    catapultLines: catapultWhyLines,
    maxLines: 3,
  });
  const coachAction = mergeActionLines({
    baseLines: explainReadinessCoachActions(rules.triggeredRules, rules.athleteState),
    catapultHint: catapultActionHint,
    maxLines: 3,
  });

  return {
    athleteState: rules.athleteState,
    sessionMode: rules.sessionMode,
    confidence: rules.confidence,
    confidenceHint: catapultConfidenceHint,
    score: rules.score,
    why: whyLines,
    coachAction,
    riskFactors: rules.riskFactors,
    externalLoadState: normalized.externalLoadState ?? null,
    catapultWhyLines,
    catapultActionHint,
    catapultConfidenceHint,
    supportingMetrics: {
      readinessScore: normalized.readinessScore ?? normalized.checkinScore,
      zScore: normalized.zScore,
      deltaZ: normalized.deltaZ,
      acwr: normalized.acwr,
      sleepScore: normalized.sleepScore,
      hrvChangePct: normalized.hrvChangePct,
      volatility: normalized.volatility,
      sorenessScore: normalized.sorenessScore,
      acuteLoad: normalized.acuteLoad,
      chronicLoad: normalized.chronicLoad,
    },
    debug: {
      triggeredRules: rules.triggeredRules,
      missingInputs: rules.missingInputs,
    },
  };
}

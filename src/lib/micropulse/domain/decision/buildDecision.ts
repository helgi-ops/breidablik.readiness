import type { InjuryRiskDecision } from "@/lib/micropulse/injuryRisk";
import type { ExplainableReadinessDecision } from "@/lib/micropulse/readiness";
import type { DailyAthleteSnapshot } from "../snapshot/types";
import { buildDecisionExplanationLines, buildDecisionReasons, buildDecisionRecommendations } from "./explanations";
import { buildDecisionFlags } from "./flags";
import { deriveLoadAction } from "./loadAction";
import { deriveSessionMode } from "./sessionMode";
import type { AthleteDecision, AthleteState, NeuralStatus } from "./types";

type BuildAthleteDecisionParams = {
  snapshot: DailyAthleteSnapshot;
  readinessDecision?: ExplainableReadinessDecision | null;
  injuryDecision?: InjuryRiskDecision | null;
  neural?: {
    status?: NeuralStatus | null;
    confidence?: number | null;
    summary?: string | null;
  } | null;
  load?: {
    concernLevel?: "none" | "low" | "moderate" | "high" | null;
    summary?: string | null;
  } | null;
  whoop?: {
    overallSupportScore?: number | null;
    confidence?: number | null;
    explanationLine?: string | null;
  } | null;
  hardBlock?: boolean | null;
  explicitRecoveryDay?: boolean | null;
};

function mapReadinessConfidence(value?: "low" | "medium" | "high" | null): number {
  if (value === "high") return 0.85;
  if (value === "medium") return 0.65;
  return 0.4;
}

function inferAthleteState(args: {
  hardBlock: boolean;
  rehab: boolean;
  readinessState: AthleteState;
  neuralStatus: NeuralStatus;
  injurySeverity: "none" | "low" | "moderate" | "high";
  loadConcernLevel: "none" | "low" | "moderate" | "high";
}): AthleteState {
  if (args.hardBlock || args.rehab) return "RED";
  if (args.readinessState === "RED") return "RED";
  if (args.neuralStatus === "suppressed") return "RED";
  if (args.injurySeverity === "high" || args.loadConcernLevel === "high") return "RED";
  if (
    args.readinessState === "YELLOW" ||
    args.neuralStatus === "caution" ||
    args.injurySeverity === "moderate" ||
    args.loadConcernLevel === "moderate"
  ) {
    return "YELLOW";
  }
  return args.readinessState;
}

export function buildAthleteDecision(params: BuildAthleteDecisionParams): AthleteDecision {
  const snapshot = params.snapshot;
  const readinessState = params.readinessDecision?.athleteState ?? (snapshot.derived.hasManualData ? "YELLOW" : "GRAY");
  const hardBlock = params.hardBlock === true;
  const rehab = snapshot.context.rehab === true || snapshot.context.returnToPlay === true;
  const neuralStatus = params.neural?.status ?? "unknown";
  const injurySeverity =
    params.injuryDecision?.injuryRiskLevel === "HIGH"
      ? "high"
      : params.injuryDecision?.injuryRiskLevel === "MODERATE"
      ? "moderate"
      : params.injuryDecision?.injuryRiskLevel === "LOW"
      ? "low"
      : "none";
  const loadConcernLevel = params.load?.concernLevel ?? "none";
  const whoopInfluenced =
    snapshot.derived.hasWhoopData &&
    (!!params.whoop?.explanationLine ||
      (params.readinessDecision?.riskFactors ?? []).some((factor) => factor.startsWith("whoop_")));
  const athleteState = inferAthleteState({
    hardBlock,
    rehab,
    readinessState,
    neuralStatus,
    injurySeverity,
    loadConcernLevel,
  });
  const lowDataConfidence = snapshot.derived.overallSnapshotConfidence < 0.45;
  const sessionMode = deriveSessionMode({
    athleteState,
    rehab,
    hardBlock,
    explicitRecoveryDay: params.explicitRecoveryDay === true,
    insufficientData: lowDataConfidence,
  });
  const loadAction = deriveLoadAction({
    athleteState,
    hardBlock,
    injuryConcern: injurySeverity === "moderate" || injurySeverity === "high",
    neuralConcern: neuralStatus === "caution" || neuralStatus === "suppressed",
    loadConcernLevel,
    lowDataConfidence,
  });
  const decisionConfidence = Math.max(
    0,
    Math.min(
      1,
      snapshot.derived.overallSnapshotConfidence * 0.55 +
        mapReadinessConfidence(params.readinessDecision?.confidence) * 0.35 +
        (params.neural?.confidence ?? 0.5) * 0.05 +
        (params.whoop?.confidence ?? 0.5) * 0.05
    )
  );
  const reasons = buildDecisionReasons({
    hardBlock,
    rehab,
    readinessWhy: params.readinessDecision?.why,
    neuralSummary: params.neural?.summary ?? null,
    injurySummary:
      params.injuryDecision && params.injuryDecision.why.length
        ? params.injuryDecision.why[0]
        : params.injuryDecision
        ? `Injury risk remains ${params.injuryDecision.injuryRiskLevel.toLowerCase()}.`
        : null,
    loadSummary: params.load?.summary ?? null,
    whoopLine: whoopInfluenced ? params.whoop?.explanationLine ?? "WHOOP influenced confidence, but not the dominant constraint." : null,
    lowDataConfidence,
  });
  const explanationLines = buildDecisionExplanationLines({
    athleteState,
    sessionMode,
    reasons,
  });
  const recommendations = buildDecisionRecommendations({
    athleteState,
    loadAction,
    coachAction: params.readinessDecision?.coachAction,
    lowDataConfidence,
  });
  const flags = buildDecisionFlags({
    hardBlock,
    recoveryBias: sessionMode === "recovery",
    whoopInfluenced,
    loadConcernLevel,
    neuralStatus,
    injurySeverity,
    lowDataConfidence,
  });

  return {
    athleteId: snapshot.athleteId,
    date: snapshot.date,
    athleteState,
    sessionMode,
    loadAction,
    neuralStatus,
    readinessScore: params.readinessDecision?.score ?? null,
    decisionConfidence,
    flags,
    reasons,
    explanationLines,
    recommendations,
    sourceSummary: {
      manual: snapshot.derived.hasManualData,
      whoop: snapshot.derived.hasWhoopData,
      load: snapshot.derived.hasLoadData,
      neuromuscular: snapshot.derived.hasNeuromuscularData,
      context: snapshot.derived.hasContextData,
    },
    engineContributions: {
      readiness: params.readinessDecision
        ? {
            score: params.readinessDecision.score ?? null,
            state: params.readinessDecision.athleteState,
            confidence: mapReadinessConfidence(params.readinessDecision.confidence),
          }
        : undefined,
      whoop: params.whoop
        ? {
            overallSupportScore: params.whoop.overallSupportScore ?? null,
            confidence: params.whoop.confidence ?? null,
          }
        : undefined,
      neural: params.neural
        ? {
            status: params.neural.status ?? null,
            confidence: params.neural.confidence ?? null,
          }
        : undefined,
      injury: {
        severity: injurySeverity,
      },
      load: {
        concernLevel: loadConcernLevel,
      },
    },
  };
}

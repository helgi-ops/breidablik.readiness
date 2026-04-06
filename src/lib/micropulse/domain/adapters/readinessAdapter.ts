import type { DailyAthleteSnapshot } from "@/lib/micropulse/domain/snapshot/types";
import type { ExplainableReadinessDecision, NormalizedPlayerMonitoringInput } from "@/lib/micropulse/readiness/types";
import type { WhoopFusionFeatures } from "@/lib/micropulse/integrations/whoopFusion/types";

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function mapSnapshotToReadinessInput(args: {
  snapshot: DailyAthleteSnapshot;
  playerName?: string | null;
  readinessScore?: number | null;
  checkinScore?: number | null;
  whoopFeatures?: Partial<WhoopFusionFeatures> | null;
  lightAteState?: "GREEN" | "YELLOW" | "RED" | "GRAY" | null;
}): NormalizedPlayerMonitoringInput {
  const { snapshot } = args;
  return {
    dailySnapshot: snapshot,
    playerId: snapshot.athleteId,
    playerName: args.playerName ?? snapshot.athleteId,
    date: snapshot.date,
    readinessScore: asNumber(args.readinessScore),
    checkinScore: asNumber(args.checkinScore),
    zScore: asNumber(snapshot.stability.zScore),
    deltaZ: asNumber(snapshot.stability.deltaZ),
    volatility: asNumber(snapshot.stability.volatility5d ?? snapshot.stability.volatility7d),
    sleepScore: asNumber(snapshot.subjective.sleepQuality ?? snapshot.recovery.sleepPerformance),
    hrvScore: asNumber(snapshot.autonomic.hrv),
    acuteLoad: asNumber(snapshot.load.acuteLoad),
    chronicLoad: asNumber(snapshot.load.chronicLoad),
    acwr: asNumber(snapshot.load.acwr),
    sessionRpeLoad: asNumber(snapshot.load.sessionRpeLoad),
    sorenessScore: asNumber(snapshot.subjective.soreness),
    stenScore: undefined,
    matchCongestion: snapshot.context.matchCongestion ?? undefined,
    travelLoad: snapshot.context.travel ?? undefined,
    dataCompleteness: snapshot.derived.overallSnapshotConfidence,
    lightAteState: args.lightAteState ?? null,
    whoop: args.whoopFeatures
      ? {
          hasWhoopData: snapshot.derived.hasWhoopData,
          recoverySupportScore: args.whoopFeatures.recoverySupportScore ?? null,
          sleepSupportScore: args.whoopFeatures.sleepSupportScore ?? null,
          autonomicSupportScore: args.whoopFeatures.autonomicSupportScore ?? null,
          loadSupportScore: args.whoopFeatures.loadSupportScore ?? null,
          overallSupportScore: args.whoopFeatures.overallSupportScore ?? null,
          recoveryFlag: args.whoopFeatures.recoveryFlag ?? null,
          sleepFlag: args.whoopFeatures.sleepFlag ?? null,
          autonomicFlag: args.whoopFeatures.autonomicFlag ?? null,
          loadFlag: args.whoopFeatures.loadFlag ?? null,
          confidence: args.whoopFeatures.confidence ?? undefined,
          missingFields: args.whoopFeatures.missingFields ?? [],
          notes: args.whoopFeatures.notes ?? [],
        }
      : undefined,
  };
}

export function mapReadinessDecisionContribution(readinessDecision?: ExplainableReadinessDecision | null) {
  if (!readinessDecision) return null;
  return {
    score: readinessDecision.score ?? null,
    state: readinessDecision.athleteState,
    confidence:
      readinessDecision.confidence === "high" ? 0.85 : readinessDecision.confidence === "medium" ? 0.65 : 0.4,
  };
}

import type { NormalizedPlayerMonitoringInput } from "./types";
import { buildReadinessWhoopSection } from "@/lib/integrations/shared/monitoringSnapshot";
import {
  buildCatapultReadinessModifier,
  computeCatapultExternalLoadSignals,
  type CatapultDailyLoadRow,
} from "@/lib/micropulse/externalLoad";

function n(v: unknown): number | undefined {
  const val = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(val) ? val : undefined;
}

function b(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return undefined;
}

function tissueSeverity(v: unknown): "LOW" | "MODERATE" | "HIGH" | null | undefined {
  const s = String(v ?? "").toUpperCase();
  if (s === "LOW" || s === "MODERATE" || s === "HIGH") return s;
  if (v == null) return null;
  return undefined;
}

export function normalizePlayerMonitoringInput(input: NormalizedPlayerMonitoringInput): NormalizedPlayerMonitoringInput {
  const snapshot = input.dailySnapshot ?? null;
  const whoopSection =
    input.whoop ??
    (input.whoopSnapshot?.source === "whoop" ? buildReadinessWhoopSection(input.whoopSnapshot) : undefined);
  const snapshotCatapultDailyLoad: CatapultDailyLoadRow | null =
    snapshot?.externalLoad?.source === "catapult"
      ? {
          playerId: input.playerId,
          teamId: null,
          date: input.date,
          totalDistance: n(snapshot.externalLoad.totalDistance) ?? null,
          hirDist: n(snapshot.externalLoad.highSpeedDistance) ?? null,
          maxVelocity: n(snapshot.externalLoad.maxVelocity) ?? null,
          accelerations: n(snapshot.externalLoad.accelerations) ?? null,
          decelerations: n(snapshot.externalLoad.decelerations) ?? null,
          playerLoad: n(snapshot.externalLoad.playerLoad) ?? null,
          playerLoadPerMinute: null,
          velocityBand5TotalDistance: null,
          velocityBand6TotalDistance: n(snapshot.externalLoad.sprintDistance) ?? null,
          accelBand2to3Efforts: null,
          decelBand2to3Efforts: null,
          totalAccelerations: n(snapshot.externalLoad.accelerations) ?? null,
          totalDecelerations: n(snapshot.externalLoad.decelerations) ?? null,
        }
      : null;
  const catapultBaseline = input.catapultBaseline ?? null;
  const catapultDailyLoad = input.catapultDailyLoad ?? snapshotCatapultDailyLoad;
  const catapultSignals =
    input.catapultSignals ??
    (catapultDailyLoad && catapultBaseline
      ? computeCatapultExternalLoadSignals({
          today: catapultDailyLoad,
          baseline: catapultBaseline,
        })
      : null);
  const catapultReadinessModifier =
    input.catapultReadinessModifier ??
    (catapultDailyLoad && catapultBaseline && catapultSignals
      ? buildCatapultReadinessModifier({
          today: catapultDailyLoad,
          baseline: catapultBaseline,
          signals: catapultSignals,
        })
      : null);

  return {
    ...input,
    readinessScore: n(input.readinessScore),
    checkinScore: n(input.checkinScore),
    zScore: n(input.zScore ?? snapshot?.stability.zScore),
    deltaZ: n(input.deltaZ ?? snapshot?.stability.deltaZ),
    volatility: n(input.volatility ?? snapshot?.stability.volatility5d ?? snapshot?.stability.volatility7d),
    sleepScore: n(input.sleepScore ?? snapshot?.subjective.sleepQuality ?? snapshot?.recovery.sleepPerformance),
    sleepVsBaseline: n(input.sleepVsBaseline),
    hrvScore: n(input.hrvScore ?? snapshot?.autonomic.hrv),
    hrvChangePct: n(input.hrvChangePct),
    stenScore: n(input.stenScore),
    tissueSignal: b(input.tissueSignal),
    tissueSeverity: tissueSeverity(input.tissueSeverity),
    explicitPainTextFlag: b(input.explicitPainTextFlag),
    sorenessScore: n(input.sorenessScore ?? snapshot?.subjective.soreness),
    acuteLoad: n(input.acuteLoad ?? snapshot?.load.acuteLoad),
    chronicLoad: n(input.chronicLoad ?? snapshot?.load.chronicLoad),
    acwr: n(input.acwr ?? snapshot?.load.acwr),
    sessionRpeLoad: n(input.sessionRpeLoad ?? snapshot?.load.sessionRpeLoad),
    durationMinutes: n(input.durationMinutes),
    highSpeedRunning: n(input.highSpeedRunning),
    maxVelocityPct: n(input.maxVelocityPct),
    recentYellowDays: n(input.recentYellowDays),
    recentRedDays: n(input.recentRedDays),
    dataCompleteness: n(input.dataCompleteness ?? snapshot?.derived.overallSnapshotConfidence),
    sorenessFlag: b(input.sorenessFlag),
    painFlag: b(input.painFlag),
    gpsSpike: b(input.gpsSpike),
    matchCongestion: b(input.matchCongestion ?? snapshot?.context.matchCongestion),
    travelLoad: b(input.travelLoad ?? snapshot?.context.travel),
    catapultDailyLoad,
    catapultBaseline,
    catapultSignals,
    externalLoadState: input.externalLoadState ?? catapultSignals?.externalLoadState ?? null,
    catapultReadinessModifier,
    valdDailySnapshot: input.valdDailySnapshot ?? null,
    valdReadinessAdjustment: input.valdReadinessAdjustment ?? null,
    whoop: whoopSection
      ? {
          ...whoopSection,
          hasWhoopData: whoopSection.hasWhoopData === true,
          recoverySupportScore: n(whoopSection.recoverySupportScore),
          sleepSupportScore: n(whoopSection.sleepSupportScore),
          autonomicSupportScore: n(whoopSection.autonomicSupportScore),
          loadSupportScore: n(whoopSection.loadSupportScore),
          overallSupportScore: n(whoopSection.overallSupportScore),
          confidence: n(whoopSection.confidence),
          missingFields: Array.isArray(whoopSection.missingFields) ? whoopSection.missingFields : [],
          notes: Array.isArray(whoopSection.notes) ? whoopSection.notes : [],
          explanationLines: Array.isArray(whoopSection.explanationLines) ? whoopSection.explanationLines : [],
        }
      : undefined,
  };
}

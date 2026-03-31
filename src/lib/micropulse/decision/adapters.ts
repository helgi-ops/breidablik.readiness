import type { InjuryRiskDecision } from "@/lib/micropulse/injuryRisk";
import type { ExplainableReadinessDecision, NormalizedPlayerMonitoringInput } from "@/lib/micropulse/readiness";
import type { CatapultDailyLoadRow, CatapultExternalLoadBaseline, CatapultExternalLoadSignals } from "@/lib/micropulse/externalLoad";
import type { DailyAthleteSnapshot } from "@/lib/micropulse/domain/snapshot/types";
import type { DecisionInput, DecisionState } from "./types";
import { computeLoadDeltaVs7dAvg, coerceState, isFiniteNumber } from "./helpers";

type BuildDecisionInputContext = {
  athleteId: string;
  date: string;
  readinessDecision?: ExplainableReadinessDecision | null;
  injuryDecision?: InjuryRiskDecision | null;
  lightAteState?: DecisionState | null;
  monitoringInput?: Partial<NormalizedPlayerMonitoringInput> | null;
  catapultDailyLoad?: CatapultDailyLoadRow | null;
  catapultBaseline?: CatapultExternalLoadBaseline | null;
  catapultSignals?: CatapultExternalLoadSignals | null;
  snapshot?: DailyAthleteSnapshot | null;
  context?: DecisionInput["context"] | null;
};

function buildLoadSection(args: {
  monitoringInput?: Partial<NormalizedPlayerMonitoringInput> | null;
  catapultDailyLoad?: CatapultDailyLoadRow | null;
  catapultBaseline?: CatapultExternalLoadBaseline | null;
  catapultSignals?: CatapultExternalLoadSignals | null;
  snapshot?: DailyAthleteSnapshot | null;
}): DecisionInput["load"] {
  const monitoring = args.monitoringInput ?? null;
  const today = args.catapultDailyLoad ?? null;
  const baseline = args.catapultBaseline ?? null;
  const snapshot = args.snapshot ?? null;
  const densityStress =
    isFiniteNumber(today?.playerLoadPerMinute) ? today?.playerLoadPerMinute : args.catapultSignals?.densityStressRatio && baseline
      ? baseline.chronic28dAvg.densityStress * (args.catapultSignals.densityStressRatio ?? 0)
      : null;
  const accelTotal = isFiniteNumber(today?.accelerations)
    ? today?.accelerations
    : isFiniteNumber(today?.totalAccelerations)
    ? today?.totalAccelerations
    : null;
  const decelTotal = isFiniteNumber(today?.decelerations)
    ? today?.decelerations
    : isFiniteNumber(today?.totalDecelerations)
    ? today?.totalDecelerations
    : null;

  const load: DecisionInput["load"] = {
    dailyLoad: isFiniteNumber(today?.playerLoad)
      ? today?.playerLoad
      : isFiniteNumber(snapshot?.externalLoad.playerLoad)
      ? snapshot?.externalLoad.playerLoad
      : monitoring?.acuteLoad ?? null,
    weeklyLoad: baseline ? baseline.acute7d.playerLoad : null,
    rolling7dAvg: baseline
      ? baseline.acute7d.playerLoad / 7
      : isFiniteNumber(snapshot?.externalLoad.playerLoad7DayAverage)
      ? snapshot?.externalLoad.playerLoad7DayAverage
      : null,
    acuteLoad: isFiniteNumber(monitoring?.acuteLoad)
      ? monitoring!.acuteLoad!
      : isFiniteNumber(snapshot?.load.acuteLoad)
      ? snapshot!.load.acuteLoad!
      : baseline?.acute7d.playerLoad ?? null,
    chronicLoad: isFiniteNumber(monitoring?.chronicLoad)
      ? monitoring!.chronicLoad!
      : isFiniteNumber(snapshot?.load.chronicLoad)
      ? snapshot!.load.chronicLoad!
      : baseline?.chronic28dAvg.playerLoad ?? null,
    acwr: isFiniteNumber(monitoring?.acwr) ? monitoring!.acwr! : isFiniteNumber(snapshot?.load.acwr) ? snapshot!.load.acwr! : null,
    loadDeltaVs7dAvg: null,
    highSpeedRunningDistance: isFiniteNumber(today?.hirDist)
      ? today?.hirDist
      : isFiniteNumber(snapshot?.externalLoad.highSpeedDistance)
      ? snapshot?.externalLoad.highSpeedDistance
      : isFiniteNumber(monitoring?.highSpeedRunning)
      ? monitoring?.highSpeedRunning
      : null,
    velocityBand5Distance: today?.velocityBand5TotalDistance ?? null,
    velocityBand6Distance:
      today?.velocityBand6TotalDistance ??
      (isFiniteNumber(snapshot?.externalLoad.sprintDistance) ? snapshot?.externalLoad.sprintDistance : null),
    totalAccelerations: accelTotal,
    totalDecelerations: decelTotal,
    accelDecelDensity:
      isFiniteNumber(accelTotal) || isFiniteNumber(decelTotal)
        ? ((accelTotal ?? 0) + (decelTotal ?? 0)) / Math.max(1, isFiniteNumber(today?.playerLoad) ? today!.playerLoad! : 1)
        : null,
    missing: !today && !isFiniteNumber(monitoring?.acuteLoad) && !isFiniteNumber(monitoring?.acwr),
  };

  load.loadDeltaVs7dAvg = computeLoadDeltaVs7dAvg(load);
  if (!load.dailyLoad && !load.acuteLoad && !load.chronicLoad && !load.acwr && !load.highSpeedRunningDistance) {
    return { missing: true };
  }
  if (!isFiniteNumber(load.dailyLoad) && isFiniteNumber(monitoring?.sessionRpeLoad)) load.dailyLoad = monitoring?.sessionRpeLoad ?? null;
  if (!isFiniteNumber(load.dailyLoad) && isFiniteNumber(monitoring?.acuteLoad)) load.dailyLoad = monitoring?.acuteLoad ?? null;
  if (!isFiniteNumber(load.accelDecelDensity) && isFiniteNumber(densityStress)) load.accelDecelDensity = densityStress;
  return load;
}

export function buildDecisionInput(raw: unknown): DecisionInput {
  if (!raw || typeof raw !== "object") {
    return {
      athleteId: "unknown",
      date: new Date().toISOString().slice(0, 10),
      context: { manuallyFlagged: true },
      wellness: { missing: true },
      load: { missing: true },
    };
  }

  const obj = raw as Partial<DecisionInput>;
  return {
    athleteId: typeof obj.athleteId === "string" ? obj.athleteId : "unknown",
    date: typeof obj.date === "string" ? obj.date : new Date().toISOString().slice(0, 10),
    readinessState: coerceState(obj.readinessState),
    readinessScore: isFiniteNumber(obj.readinessScore) ? obj.readinessScore : null,
    injuryRiskState: coerceState(obj.injuryRiskState),
    injuryRiskScore: isFiniteNumber(obj.injuryRiskScore) ? obj.injuryRiskScore : null,
    lightAteState: coerceState(obj.lightAteState),
    wellness: obj.wellness ?? { missing: true },
    load: obj.load ?? { missing: true },
    context: obj.context ?? null,
  };
}

export function buildDecisionInputFromDailyPlayerRecord(args: BuildDecisionInputContext): DecisionInput {
  const monitoring = args.monitoringInput ?? null;
  const readinessState = coerceState(args.readinessDecision?.athleteState) ?? null;
  const injuryRiskState =
    args.injuryDecision?.injuryRiskLevel === "HIGH"
      ? "RED"
      : args.injuryDecision?.injuryRiskLevel === "MODERATE"
      ? "YELLOW"
      : args.injuryDecision?.injuryRiskLevel === "LOW"
      ? "GREEN"
      : null;

  return {
    athleteId: args.athleteId,
    date: args.date,
    readinessState,
    readinessScore: isFiniteNumber(args.readinessDecision?.score) ? args.readinessDecision?.score ?? null : monitoring?.readinessScore ?? null,
    injuryRiskState,
    injuryRiskScore: isFiniteNumber(args.injuryDecision?.riskScore) ? args.injuryDecision?.riskScore ?? null : null,
    lightAteState: coerceState(args.lightAteState),
    wellness: {
      soreness: isFiniteNumber(monitoring?.sorenessScore) ? monitoring?.sorenessScore ?? null : null,
      fatigue: isFiniteNumber(monitoring?.checkinScore) ? monitoring?.checkinScore ?? null : null,
      sleepQuality: isFiniteNumber(monitoring?.sleepScore) ? monitoring?.sleepScore ?? null : null,
      mood: null,
      stress: null,
      motivation: null,
      recovery: isFiniteNumber(monitoring?.sleepScore) ? monitoring?.sleepScore ?? null : null,
      sessionRpePrevious: isFiniteNumber(monitoring?.sessionRpeLoad) ? monitoring?.sessionRpeLoad ?? null : null,
      missing: !isFiniteNumber(monitoring?.sorenessScore) && !isFiniteNumber(monitoring?.sleepScore) && !isFiniteNumber(monitoring?.checkinScore),
    },
    load: buildLoadSection({
      monitoringInput: monitoring,
      catapultDailyLoad: args.catapultDailyLoad,
      catapultBaseline: args.catapultBaseline,
      catapultSignals: args.catapultSignals,
      snapshot: args.snapshot,
    }),
    context: args.context ?? null,
  };
}

export function buildDecisionInputFromReadinessContext(args: BuildDecisionInputContext): DecisionInput {
  return buildDecisionInputFromDailyPlayerRecord(args);
}

export function buildDecisionInputFromDevPlayerContext(args: BuildDecisionInputContext): DecisionInput {
  return buildDecisionInputFromDailyPlayerRecord(args);
}

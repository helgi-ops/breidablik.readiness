import { computeSnapshotConfidence } from "./confidence";
import { buildSnapshotSourceStatus } from "./sourceStatus";
import type { DailyAthleteSnapshot } from "./types";
import { mapContextToSnapshotFields, mapLoadToSnapshotFields, mapManualToSnapshotFields, mapWhoopToSnapshotFields } from "../adapters";
import type { NormalizedMonitoringSnapshot } from "@/lib/integrations/shared/types";

type SnapshotBuilderParams = {
  athleteId: string;
  date: string;
  manual?: {
    id?: string | null;
    totalScore?: number | null;
    soreness?: number | null;
    stress?: number | null;
    mood?: number | null;
    sleepQuality?: number | null;
    motivation?: number | null;
    completed?: boolean | null;
    sourceDate?: string | null;
  } | null;
  whoop?: {
    snapshot?: NormalizedMonitoringSnapshot | null;
    connected?: boolean | null;
    lastSyncAt?: string | null;
    sourceDate?: string | null;
  } | null;
  load?: {
    id?: string | null;
    sessionRpeLoad?: number | null;
    acuteLoad?: number | null;
    chronicLoad?: number | null;
    acwr?: number | null;
    gpsLoad?: number | null;
    zScore?: number | null;
    deltaZ?: number | null;
    volatility5d?: number | null;
    volatility7d?: number | null;
    sourceDate?: string | null;
  } | null;
  neuromuscular?: {
    id?: string | null;
    cmj?: number | null;
    imtp?: number | null;
    asymmetry?: number | null;
    nordbord?: number | null;
    forceFrame?: number | null;
    sourceDate?: string | null;
  } | null;
  context?: {
    travel?: boolean | null;
    matchCongestion?: boolean | null;
    minutesPlayedLastMatch?: number | null;
    rehab?: boolean | null;
    returnToPlay?: boolean | null;
    weekSetupLabel?: string | null;
    expectedSessionType?: string | null;
    sourceDate?: string | null;
  } | null;
  rawRefs?: DailyAthleteSnapshot["rawRefs"];
};

export function buildDailyAthleteSnapshot(params: SnapshotBuilderParams): DailyAthleteSnapshot {
  const manual = mapManualToSnapshotFields(params.manual);
  const whoop = mapWhoopToSnapshotFields({
    snapshot: params.whoop?.snapshot,
    connected: params.whoop?.connected,
    lastSyncAt: params.whoop?.lastSyncAt,
  });
  const load = mapLoadToSnapshotFields({
    load: params.load,
    whoopStrain: whoop.load.whoopStrain ?? null,
  });
  const context = mapContextToSnapshotFields(params.context);

  const snapshot: DailyAthleteSnapshot = {
    athleteId: params.athleteId,
    date: params.date,
    sourceStatus: buildSnapshotSourceStatus({
      targetDate: params.date,
      manual: { available: manual.subjective.checkInCompleted, sourceDate: params.manual?.sourceDate ?? params.date },
      whoop: { available: whoop.integrations.whoop?.snapshotAvailable === true, sourceDate: params.whoop?.sourceDate ?? params.whoop?.snapshot?.date ?? null },
      load: {
        available:
          load.load.gpsLoad != null || load.load.sessionRpeLoad != null || load.load.acuteLoad != null || load.load.acwr != null,
        sourceDate: params.load?.sourceDate ?? params.date,
      },
      neuromuscular: {
        available:
          params.neuromuscular?.cmj != null ||
          params.neuromuscular?.imtp != null ||
          params.neuromuscular?.asymmetry != null ||
          params.neuromuscular?.nordbord != null ||
          params.neuromuscular?.forceFrame != null,
        sourceDate: params.neuromuscular?.sourceDate ?? params.date,
      },
      context: {
        available: !!params.context,
        sourceDate: params.context?.sourceDate ?? params.date,
      },
    }),
    subjective: manual.subjective,
    recovery: whoop.recovery,
    autonomic: whoop.autonomic,
    load: load.load,
    neuromuscular: {
      cmj: params.neuromuscular?.cmj ?? null,
      imtp: params.neuromuscular?.imtp ?? null,
      asymmetry: params.neuromuscular?.asymmetry ?? null,
      nordbord: params.neuromuscular?.nordbord ?? null,
      forceFrame: params.neuromuscular?.forceFrame ?? null,
    },
    stability: load.stability,
    context: context.context,
    integrations: whoop.integrations,
    derived: {
      hasManualData: manual.subjective.checkInCompleted,
      hasWhoopData: whoop.integrations.whoop?.snapshotAvailable === true,
      hasLoadData:
        load.load.gpsLoad != null || load.load.sessionRpeLoad != null || load.load.acuteLoad != null || load.load.acwr != null,
      hasNeuromuscularData:
        params.neuromuscular?.cmj != null ||
        params.neuromuscular?.imtp != null ||
        params.neuromuscular?.asymmetry != null ||
        params.neuromuscular?.nordbord != null ||
        params.neuromuscular?.forceFrame != null,
      hasContextData: !!params.context,
      overallSnapshotConfidence: 0,
    },
    rawRefs: {
      ...params.rawRefs,
      ...manual.rawRefs,
      ...whoop.rawRefs,
      ...load.rawRefs,
      testRecordId: params.neuromuscular?.id ?? params.rawRefs?.testRecordId ?? null,
    },
  };

  snapshot.derived.overallSnapshotConfidence = computeSnapshotConfidence(snapshot);
  return snapshot;
}

import type { SnapshotSourceStatus } from "./sourceStatus";

export interface DailyAthleteSnapshot {
  athleteId: string;
  date: string;

  sourceStatus: SnapshotSourceStatus;

  subjective: {
    soreness?: number | null;
    stress?: number | null;
    mood?: number | null;
    sleepQuality?: number | null;
    motivation?: number | null;
    checkInCompleted: boolean;
  };

  recovery: {
    recoveryScore?: number | null;
    sleepPerformance?: number | null;
    sleepDurationMillis?: number | null;
    sleepConsistency?: number | null;
    sleepEfficiency?: number | null;
  };

  autonomic: {
    hrv?: number | null;
    restingHr?: number | null;
    respiratoryRate?: number | null;
  };

  load: {
    sessionRpeLoad?: number | null;
    acuteLoad?: number | null;
    chronicLoad?: number | null;
    acwr?: number | null;
    gpsLoad?: number | null;
    whoopStrain?: number | null;
    loadSourcePriority?: "gps" | "rpe" | "whoop" | "unknown" | null;
  };

  externalLoad: {
    totalDistance?: number | null;
    highSpeedDistance?: number | null;
    sprintDistance?: number | null;
    accelerations?: number | null;
    decelerations?: number | null;
    playerLoad?: number | null;
    maxVelocity?: number | null;
    playerLoad7DayAverage?: number | null;
    sprintDistance7DayAverage?: number | null;
    source?: "catapult" | null;
  };

  neuromuscular: {
    cmj?: number | null;
    imtp?: number | null;
    asymmetry?: number | null;
    nordbord?: number | null;
    forceFrame?: number | null;
  };

  stability: {
    zScore?: number | null;
    deltaZ?: number | null;
    volatility5d?: number | null;
    volatility7d?: number | null;
  };

  context: {
    travel?: boolean | null;
    matchCongestion?: boolean | null;
    minutesPlayedLastMatch?: number | null;
    rehab?: boolean | null;
    returnToPlay?: boolean | null;
    weekSetupLabel?: string | null;
    expectedSessionType?: string | null;
  };

  integrations: {
    whoop?: {
      connected: boolean;
      snapshotAvailable: boolean;
      confidence?: number | null;
      lastSyncAt?: string | null;
    } | null;
  };

  derived: {
    hasManualData: boolean;
    hasWhoopData: boolean;
    hasLoadData: boolean;
    hasExternalLoadData: boolean;
    hasNeuromuscularData: boolean;
    hasContextData: boolean;
    overallSnapshotConfidence: number;
  };

  rawRefs?: {
    manualCheckInId?: string | null;
    whoopSnapshotId?: string | null;
    loadRecordId?: string | null;
    testRecordId?: string | null;
  };
}

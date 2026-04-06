export interface NormalizedMonitoringSnapshot {
  athleteId: string;
  source: "whoop";
  date: string;
  recoveryScore?: number;
  hrv?: number;
  restingHr?: number;
  respiratoryRate?: number;
  sleepPerformance?: number;
  sleepConsistency?: number;
  sleepEfficiency?: number;
  totalSleepMillis?: number;
  workoutStrain?: number;
  averageHr?: number;
  maxHr?: number;
  raw?: unknown;
}


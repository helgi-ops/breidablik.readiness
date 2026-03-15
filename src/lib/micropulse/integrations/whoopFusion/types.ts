export interface WhoopFusionInput {
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
}

export type WhoopSupportFlag = "positive" | "neutral" | "negative" | null;

export interface ReadinessWhoopSection {
  hasWhoopData: boolean;
  recoverySupportScore?: number | null;
  sleepSupportScore?: number | null;
  autonomicSupportScore?: number | null;
  loadSupportScore?: number | null;
  overallSupportScore?: number | null;
  recoveryFlag?: WhoopSupportFlag;
  sleepFlag?: WhoopSupportFlag;
  autonomicFlag?: WhoopSupportFlag;
  loadFlag?: WhoopSupportFlag;
  confidence?: number;
  explanationLines?: string[];
  missingFields?: string[];
  notes?: string[];
}

export interface WhoopFusionFeatures {
  hasWhoopData: boolean;

  recoverySupportScore: number | null;
  sleepSupportScore: number | null;
  autonomicSupportScore: number | null;
  loadSupportScore: number | null;

  overallSupportScore: number | null;

  recoveryFlag: WhoopSupportFlag;
  sleepFlag: WhoopSupportFlag;
  autonomicFlag: WhoopSupportFlag;
  loadFlag: WhoopSupportFlag;

  confidence: number;
  missingFields: string[];
  notes: string[];
}


import type { NormalizedMonitoringSnapshot } from "@/lib/integrations/shared/types";
import type { DailyAthleteSnapshot } from "@/lib/micropulse/domain/snapshot/types";

export type NormalizedPlayerMonitoringInput = {
  playerId: string;
  playerName: string;
  date: string;
  dailySnapshot?: DailyAthleteSnapshot | null;

  readinessScore?: number;
  checkinScore?: number;
  zScore?: number;
  deltaZ?: number;
  volatility?: number;

  sleepScore?: number;
  sleepVsBaseline?: number;
  hrvScore?: number;
  hrvChangePct?: number;

  acuteLoad?: number;
  chronicLoad?: number;
  acwr?: number;
  sessionRpeLoad?: number;
  durationMinutes?: number;

  neuralFatigueLevel?: "low" | "moderate" | "high";
  neuralFatigueReason?: string | null;
  stenScore?: number;
  tissueSignal?: boolean;
  tissueSeverity?: "LOW" | "MODERATE" | "HIGH" | null;
  explicitPainTextFlag?: boolean;

  // 1-5 player soreness scale where 1/2 = caution, 3 = neutral, 4/5 = good.
  sorenessScore?: number;
  sorenessFlag?: boolean;
  painFlag?: boolean;

  highSpeedRunning?: number;
  maxVelocityPct?: number;
  gpsSpike?: boolean;

  recentYellowDays?: number;
  recentRedDays?: number;

  matchCongestion?: boolean;
  travelLoad?: boolean;

  dataCompleteness?: number;

  lightAteState?: "GREEN" | "YELLOW" | "RED" | "GRAY" | null;

  // Optional normalized WHOOP snapshot for conservative fusion in readiness interpretation.
  whoopSnapshot?: NormalizedMonitoringSnapshot | null;
  whoop?: {
    hasWhoopData: boolean;
    recoverySupportScore?: number | null;
    sleepSupportScore?: number | null;
    autonomicSupportScore?: number | null;
    loadSupportScore?: number | null;
    overallSupportScore?: number | null;
    recoveryFlag?: "positive" | "neutral" | "negative" | null;
    sleepFlag?: "positive" | "neutral" | "negative" | null;
    autonomicFlag?: "positive" | "neutral" | "negative" | null;
    loadFlag?: "positive" | "neutral" | "negative" | null;
    confidence?: number;
    missingFields?: string[];
    notes?: string[];
    explanationLines?: string[];
  };
};

export type ExplainableReadinessDecision = {
  athleteState: "GREEN" | "YELLOW" | "RED" | "GRAY";
  sessionMode: "full" | "modified" | "recovery" | "pending";
  confidence: "low" | "medium" | "high";
  score?: number;
  why: string[];
  coachAction: string[];
  riskFactors: string[];
  supportingMetrics?: {
    readinessScore?: number;
    zScore?: number;
    deltaZ?: number;
    acwr?: number;
    sleepScore?: number;
    hrvChangePct?: number;
    volatility?: number;
    sorenessScore?: number;
    acuteLoad?: number;
    chronicLoad?: number;
  };
  debug?: {
    triggeredRules: string[];
    missingInputs: string[];
  };
};

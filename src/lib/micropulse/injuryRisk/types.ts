export type InjuryRiskDecision = {
  injuryRiskLevel: "LOW" | "MODERATE" | "HIGH";
  confidence: "low" | "medium" | "high";
  riskScore?: number;
  why: string[];
  modifiableDrivers: string[];
  recommendation: string[];
  supportingMetrics?: {
    acwr?: number;
    zScore?: number;
    deltaZ?: number;
    volatility?: number;
    recentYellowDays?: number;
    recentRedDays?: number;
    highSpeedRunning?: number;
    maxVelocityPct?: number;
  };
  debug?: {
    triggeredRules: string[];
    missingInputs: string[];
  };
};

export type InjuryRiskInput = {
  acwr?: number;
  zScore?: number;
  deltaZ?: number;
  volatility?: number;
  recentYellowDays?: number;
  recentRedDays?: number;
  highSpeedRunning?: number;
  maxVelocityPct?: number;
  sleepScore?: number;
  hrvChangePct?: number;
  sorenessScore?: number;
  sorenessFlag?: boolean;
  painFlag?: boolean;
  gpsSpike?: boolean;
  matchCongestion?: boolean;
  travelLoad?: boolean;
};

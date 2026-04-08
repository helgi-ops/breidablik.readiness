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
  valdHamstringRiskFlag?: boolean;
  valdGroinRiskFlag?: boolean;
  valdNeuromuscularRiskFlag?: boolean;
  valdReasons?: string[];
  /**
   * Global fatigue flag — true when both MLI ≥ 65 AND Metabolic ≥ 65.
   * Indicates full-body stress from both mechanical and metabolic systems.
   */
  globalFatigueFlag?: boolean;
  /**
   * Residual MLI band — accumulated mechanical stress over 3 days.
   * "CAUTION" (110–134) or "HIGH" (≥135) signals accumulated risk.
   */
  residualMliBand?: "NORMAL" | "ELEVATED" | "CAUTION" | "HIGH";
};

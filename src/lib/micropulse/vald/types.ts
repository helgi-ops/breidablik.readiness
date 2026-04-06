export type ValdFreshnessStatus = "fresh" | "stale" | "missing";
export type ValdFlag = "green" | "yellow" | "red" | null;

export type ValdDailySnapshot = {
  teamId: string;
  microplayerId: string;
  snapshotDate: string;
  latestCmjAt?: string | null;
  latestNordbordAt?: string | null;
  latestForceframeAt?: string | null;
  cmjFreshnessStatus: ValdFreshnessStatus;
  nordbordFreshnessStatus: ValdFreshnessStatus;
  forceframeFreshnessStatus: ValdFreshnessStatus;
  cmjScore?: number | null;
  nordbordScore?: number | null;
  forceframeScore?: number | null;
  neuromuscularFlag?: ValdFlag;
  hamstringFlag?: ValdFlag;
  groinFlag?: ValdFlag;
  overallValdStatus?: ValdFlag;
  explanation: Record<string, unknown>;
};

export type ValdReadinessAdjustment = {
  adjustmentScore: number;
  confidenceWeight: number;
  flags: string[];
  explanation: string[];
};

export type ValdInjuryRiskSignals = {
  hamstringRiskFlag: boolean;
  groinRiskFlag: boolean;
  neuromuscularRiskFlag: boolean;
  reasons: string[];
};

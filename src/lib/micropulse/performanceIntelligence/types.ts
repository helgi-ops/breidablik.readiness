export type ReadinessState = "GREEN" | "YELLOW" | "RED" | "GRAY";
export type SessionMode = "full" | "modified" | "recovery" | "pending";
export type IntensityLevel = "low" | "moderate" | "high";

export type NormalizedPerformanceIntelligenceInput = {
  playerId?: string;
  playerName?: string;
  date?: string;
  readinessScore?: number | null;
  readinessState?: ReadinessState | null;
  athleteState?: ReadinessState | null;
  sessionMode?: SessionMode | null;
  neuralFatigueScore?: number | null;
  neuralFatigueFlag?: boolean | null;
  sorenessScore?: number | null;
  sleepScore?: number | null;
  stressScore?: number | null;
  energyScore?: number | null;
  moodScore?: number | null;
  rpe?: number | null;
  sessionLoad?: number | null;
  acuteLoad?: number | null;
  chronicLoad?: number | null;
  acuteChronicRatio?: number | null;
  zScore?: number | null;
  deltaZ?: number | null;
  volatility5d?: number | null;
  volatility7d?: number | null;
  matchCongestionScore?: number | null;
  travelLoadScore?: number | null;
  upcomingMatchInDays?: number | null;
  plannedSessionIntensity?: IntensityLevel | null;
  dataConfidence?: number | null;
};

export type DriverContribution = {
  key: string;
  label: string;
  contribution: number;
  direction: "positive" | "negative" | "protective" | "risk";
  value?: number | null;
  note?: string;
};

export type InjuryRiskBand = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type PerformanceBand = "PEAK" | "READY" | "MANAGEABLE" | "FATIGUED" | "AT_RISK";
export type LoadToleranceBand = "TOLERATES_HIGH" | "TOLERATES_MODERATE" | "TOLERATES_LOW" | "RECOVERY_ONLY";

export type InjuryRiskDecision = {
  score: number;
  band: InjuryRiskBand;
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
  summary: string;
};

export type PerformanceForecastDecision = {
  score: number;
  band: PerformanceBand;
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
  summary: string;
};

export type LoadForecastDecision = {
  score: number;
  band: LoadToleranceBand;
  recommendedMaxIntensity: IntensityLevel;
  recommendedAction: "full" | "modified" | "recovery";
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
  summary: string;
};

export type PerformanceIntelligenceDecision = {
  injuryRisk: InjuryRiskDecision;
  performanceForecast: PerformanceForecastDecision;
  loadForecast: LoadForecastDecision;
  coachSummary: string;
  explanationLines: string[];
  confidence: number;
};

export type TeamPerformanceIntelligenceSummary = {
  injuryRiskCounts: Record<InjuryRiskBand, number>;
  performanceBandCounts: Record<PerformanceBand, number>;
  loadToleranceCounts: Record<LoadToleranceBand, number>;
  highRiskPlayers: Array<{ playerId?: string; playerName?: string; riskScore: number; riskBand: InjuryRiskBand }>;
  recoveryRecommendedPlayers: Array<{ playerId?: string; playerName?: string; loadBand: LoadToleranceBand; recommendedAction: "full" | "modified" | "recovery" }>;
  averageRiskScore: number;
  averagePerformanceScore: number;
  teamSummaryText: string;
};

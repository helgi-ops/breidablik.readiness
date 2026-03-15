export type NvState = "GREEN" | "YELLOW" | "RED" | "GRAY";
export type NvSessionMode = "full" | "modified" | "recovery" | "pending";

export type NormalizedNeuralVolatilityInput = {
  playerId?: string;
  date?: string;
  readinessScore?: number | null;
  readinessState?: NvState | null;
  athleteState?: NvState | null;
  sessionMode?: NvSessionMode | null;
  neuralFatigueScore?: number | null;
  neuralFatigueFlag?: boolean | null;
  sorenessScore?: number | null;
  sleepScore?: number | null;
  stressScore?: number | null;
  energyScore?: number | null;
  moodScore?: number | null;
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
  readinessHistory?: Array<number | null>;
  neuralFatigueHistory?: Array<number | null>;
  sorenessHistory?: Array<number | null>;
  sleepHistory?: Array<number | null>;
  stressHistory?: Array<number | null>;
  volatilityHistory?: Array<number | null>;
  riskHistory?: Array<number | null>;
  loadHistory?: Array<number | null>;
  sessionModeHistory?: Array<NvSessionMode | null>;
  athleteStateHistory?: Array<NvState | null>;
  dataConfidence?: number | null;
};

export type DriverContribution = {
  key: string;
  label: string;
  contribution: number;
  direction: "risk" | "protective" | "positive" | "negative";
  value?: number | null;
  note?: string;
};

export type FatigueAccumulationBand = "LOW" | "BUILDING" | "ELEVATED" | "HEAVY";
export type InstabilityWindowBand = "STABLE" | "WATCH" | "UNSTABLE" | "HIGHLY_UNSTABLE";
export type CollapseRiskBand = "LOW" | "WATCH" | "HIGH" | "CRITICAL";
export type PeakWindowBand = "NOT_READY" | "APPROACHING" | "OPEN" | "PEAK";
export type TrendDirection = "IMPROVING" | "STABLE" | "WORSENING" | "SHARPLY_WORSENING";

export type FatigueAccumulationDecision = {
  score: number;
  band: FatigueAccumulationBand;
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
  summary: string;
};

export type InstabilityWindowDecision = {
  score: number;
  band: InstabilityWindowBand;
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
  summary: string;
};

export type CollapseRiskDecision = {
  score: number;
  band: CollapseRiskBand;
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
  summary: string;
};

export type PeakWindowDecision = {
  score: number;
  band: PeakWindowBand;
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
  summary: string;
};

export type TrendStateDecision = {
  direction: TrendDirection;
  scoreDelta?: number | null;
  primaryDrivers: DriverContribution[];
  secondaryDrivers: DriverContribution[];
  confidence: number;
  summary: string;
};

export type NeuralVolatilityIntelligenceDecision = {
  fatigueAccumulation: FatigueAccumulationDecision;
  instabilityWindow: InstabilityWindowDecision;
  collapseRisk: CollapseRiskDecision;
  peakWindow: PeakWindowDecision;
  trendState: TrendStateDecision;
  coachSummary: string;
  explanationLines: string[];
  confidence: number;
};

export type TeamNeuralVolatilitySummary = {
  fatigueCounts: Record<FatigueAccumulationBand, number>;
  instabilityCounts: Record<InstabilityWindowBand, number>;
  collapseCounts: Record<CollapseRiskBand, number>;
  peakCounts: Record<PeakWindowBand, number>;
  unstablePlayers: Array<{ playerId?: string; playerName?: string; instabilityScore: number; instabilityBand: InstabilityWindowBand }>;
  collapseWatchPlayers: Array<{ playerId?: string; playerName?: string; collapseScore: number; collapseBand: CollapseRiskBand }>;
  peakWindowPlayers: Array<{ playerId?: string; playerName?: string; peakScore: number; peakBand: PeakWindowBand }>;
  summaryText: string;
};

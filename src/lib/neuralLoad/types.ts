export type NeuralLoadState = "STABLE" | "RISING" | "HIGH" | "CRITICAL";
export type ReadinessTrajectory = "IMPROVING" | "FLAT" | "DECLINING";
export type NextDayRisk = "LOW" | "MODERATE" | "HIGH";

export type FatigueStub = {
  primaryFatigueType?: "NONE" | "NEURAL" | "TISSUE" | "SYSTEMIC" | "MIXED" | null;
  severity?: "LOW" | "MODERATE" | "HIGH" | null;
};

export interface NeuralLoadDriver {
  code: string;
  label: string;
  points: number;
}

export interface NeuralLoadInput {
  playerId: string;
  z: number | null;
  zPrev: number | null;
  deltaZ: number | null;
  sten: number | null;
  lowStenDays: number;
  totalScore: number | null;
  energy: number | null;
  sleepQuality: number | null;
  sleepDuration: number | null;
  stress: number | null;
  soreness: number | null;
  zHistory?: number[] | null;
  volatility?: number | null;

  hsrHighYesterday: boolean;
  maxVelocityHighYesterday: boolean;
  scheduleCongestion: boolean;
  travelFlag: boolean;
  matchMinutesHigh: boolean;
  teamVolatilityHigh: boolean;

  fatigue?: FatigueStub | null;
}

export interface NeuralLoadClassification {
  playerId: string;
  neuralLoadScore: number;
  neuralLoadState: NeuralLoadState;
  readinessTrajectory: ReadinessTrajectory;
  nextDayRisk: NextDayRisk;
  drivers: NeuralLoadDriver[];
  summary: string;
  debug?: {
    dataCompleteness: number;
    recentDropCount?: number;
    sleepTrendFlag?: boolean;
    repeatedHighLoadFlag?: boolean;
  };
}

export interface TeamNeuralLoadSummary {
  dominantState: NeuralLoadState;
  trajectorySummary: ReadinessTrajectory;
  nextDayRiskSummary: NextDayRisk;
  counts: Record<NeuralLoadState, number>;
  highRiskCount: number;
  summaryText: string;
}

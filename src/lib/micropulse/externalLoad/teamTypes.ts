import type { CatapultDailyLoadRow, ExternalLoadDataQuality, ExternalLoadState } from "./types";

export type TeamExternalLoadPlayerInput = {
  playerId: string;
  playerName?: string | null;
  readinessState?: "GREEN" | "YELLOW" | "RED" | "GRAY";
  externalLoadState: ExternalLoadState;
  dataQuality?: ExternalLoadDataQuality;
  todayRow?: CatapultDailyLoadRow | null;
  historyRows: CatapultDailyLoadRow[];
  playerLoadSpike?: number | null;
  hirSpike?: number | null;
  decelSpike?: number | null;
  accelSpike?: number | null;
  densityStressRatio?: number | null;
  maxVelocityExposureRatio?: number | null;
  band6ExposureRatio?: number | null;
  neuromuscularBurdenScore?: number | null;
};

export type TeamExternalLoadPlayerSnapshot = {
  playerId: string;
  playerName?: string | null;
  readinessState?: "GREEN" | "YELLOW" | "RED" | "GRAY";
  externalLoadState: ExternalLoadState;
  dataQuality?: ExternalLoadDataQuality;
  playerLoad?: number | null;
  hirDist?: number | null;
  maxVelocity?: number | null;
  accelerations?: number | null;
  decelerations?: number | null;
  playerLoadPerMinute?: number | null;
  band6Distance?: number | null;
  playerLoadSpike?: number | null;
  hirSpike?: number | null;
  decelSpike?: number | null;
  accelSpike?: number | null;
  densityStressRatio?: number | null;
  maxVelocityExposureRatio?: number | null;
  band6ExposureRatio?: number | null;
  neuromuscularBurdenScore?: number | null;
  historyRows: CatapultDailyLoadRow[];
};

export type TeamExternalLoadCohorts = {
  highLoadPlayers: TeamExternalLoadPlayerSnapshot[];
  elevatedLoadPlayers: TeamExternalLoadPlayerSnapshot[];
  sprintExposurePlayers: TeamExternalLoadPlayerSnapshot[];
  decelBurdenPlayers: TeamExternalLoadPlayerSnapshot[];
  repeatedBurdenPlayers: TeamExternalLoadPlayerSnapshot[];
  insufficientDataPlayers: TeamExternalLoadPlayerSnapshot[];
};

export type TeamExternalLoadTrend = {
  teamState: "normal" | "elevated" | "high" | "unknown";
  playerLoadTrend: "down" | "flat" | "up" | "unknown";
  hirTrend: "down" | "flat" | "up" | "unknown";
  decelTrend: "down" | "flat" | "up" | "unknown";
  densityTrend: "down" | "flat" | "up" | "unknown";
};

export type TeamExternalLoadAlert = {
  code: string;
  severity: "info" | "moderate" | "high";
  title: string;
  body: string;
  playerIds?: string[];
};

export type TeamExternalLoadSummary = {
  date: string;
  teamId: string;
  teamState: "normal" | "elevated" | "high" | "unknown";
  counts: {
    totalPlayers: number;
    normal: number;
    elevated: number;
    high: number;
    unknown: number;
  };
  cohorts: TeamExternalLoadCohorts;
  trend: TeamExternalLoadTrend;
  alerts: TeamExternalLoadAlert[];
  summaryLines: string[];
};

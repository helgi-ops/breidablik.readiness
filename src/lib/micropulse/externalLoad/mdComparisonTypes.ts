/**
 * MD Comparison — shared types and labels.
 * Safe to import from both client and server code.
 */

/** Canonical MD day labels used for grouping */
export type MdDay =
  | "MD-5" | "MD-4" | "MD-3" | "MD-2" | "MD-1"
  | "MD"   // match day
  | "MD+1" | "MD+2" | "MD+3"
  | "OFF"  | "TRAIN"; // fallback

/** Metrics we compare across MD sessions */
export const MD_COMPARISON_METRICS = [
  "duration",
  "totalDistance",
  "hirDist",
  "totalPlayerLoad",
  "playerLoadPerMinute",
  "velocityBand5",
  "velocityBand6",
  "accelB23",
  "decelB23",
  "maxVelocity",
  "sprintDistance",
] as const;

export type MdMetricKey = (typeof MD_COMPARISON_METRICS)[number];

export const MD_METRIC_LABELS: Record<MdMetricKey, { en: string; is: string; unit: string }> = {
  duration:            { en: "Duration",            is: "Tímalengd",             unit: "min" },
  totalDistance:       { en: "Total Distance",     is: "Heildarvegalengd",      unit: "m" },
  hirDist:            { en: "HIR Distance",        is: "HIR vegalengd",         unit: "m" },
  totalPlayerLoad:    { en: "Player Load",         is: "Player Load",           unit: "" },
  playerLoadPerMinute:{ en: "PL / min",            is: "PL / mín",             unit: "" },
  velocityBand5:      { en: "Vel Band 5",          is: "Hraðaband 5",          unit: "m" },
  velocityBand6:      { en: "Vel Band 6",          is: "Hraðaband 6",          unit: "m" },
  accelB23:           { en: "Accel B2-3",          is: "Hröðun B2-3",          unit: "#" },
  decelB23:           { en: "Decel B2-3",          is: "Hægðun B2-3",          unit: "#" },
  maxVelocity:        { en: "Max Velocity",        is: "Hámarkshraði",         unit: "km/h" },
  sprintDistance:     { en: "Sprint Dist",         is: "Sprettvegl.",          unit: "m" },
};

export type MdMetricScore = {
  metric: MdMetricKey;
  value: number | null;
  mdMean: number;
  mdStdDev: number;
  zScore: number | null;
  sten: number | null;
  sampleSize: number;
};

export type PlayerMdComparison = {
  playerId: string;
  playerName: string;
  mdDay: MdDay;
  date: string;
  metrics: MdMetricScore[];
  overallSten: number | null;
  dataQuality: "good" | "limited" | "insufficient";
};

export type MdComparisonResult = {
  date: string;
  mdDay: MdDay;
  teamId: string;
  players: PlayerMdComparison[];
  historicalSessionCount: number;
};

// ─── Planning Mode Types ───────────────────────────────────────────────────

/** Per-metric historical summary for a given MD context (no session needed) */
export type MdPlanningMetric = {
  metric: MdMetricKey;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  /** μ - 1σ (lower end of normal band) */
  low: number;
  /** μ + 1σ (upper end of normal band) */
  high: number;
  sampleSize: number;
  unit: string;
};

export type MdPlanningResult = {
  mdDay: MdDay;
  teamId: string;
  metrics: MdPlanningMetric[];
  /** Number of unique historical session dates used */
  sessionCount: number;
  /** Number of unique players in the historical data */
  playerCount: number;
  /** Date range of the historical data */
  lookbackFrom: string;
  lookbackTo: string;
};

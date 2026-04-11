/**
 * Weekly Load Tracker — shared types (client-safe).
 */

export const WEEKLY_LOAD_METRICS = [
  "totalDistance",
  "totalPlayerLoad",
  "velocityBand5",
  "velocityBand6",
  "accelB23",
  "decelB23",
] as const;

export type WeeklyLoadMetricKey = (typeof WEEKLY_LOAD_METRICS)[number];

export const WEEKLY_LOAD_LABELS: Record<WeeklyLoadMetricKey, { en: string; is: string; unit: string }> = {
  totalDistance:    { en: "Total Distance",  is: "Heildarvegalengd",  unit: "m" },
  totalPlayerLoad: { en: "Player Load",      is: "Player Load",      unit: "" },
  velocityBand5:   { en: "Vel Band 5",       is: "Hraðaband 5",     unit: "m" },
  velocityBand6:   { en: "Vel Band 6",       is: "Hraðaband 6",     unit: "m" },
  accelB23:        { en: "Accel B2-3",       is: "Hröðun B2-3",     unit: "#" },
  decelB23:        { en: "Decel B2-3",       is: "Hægðun B2-3",     unit: "#" },
};

export type WeeklyLoadDay = {
  date: string;
  dayLabel: string;
  dayOfWeek: number; // 0=Sun .. 6=Sat
  metrics: Record<WeeklyLoadMetricKey, number | null>;
  hasData: boolean;
};

export type WeeklyLoadMetricSummary = {
  metric: WeeklyLoadMetricKey;
  /** Cumulative team-avg total so far this week */
  currentTotal: number;
  /** Average full-week total from historical weeks (baseline reference) */
  typicalWeekTotal: number;
  /** currentTotal / typicalWeekTotal × 100 */
  pctOfTypical: number | null;
  /** Expected % if load were evenly distributed (daysElapsed/7 × 100) */
  expectedPctAtThisPoint: number;
  /** Linear projection of full week total */
  projectedWeekTotal: number | null;
  daysWithData: number;
  /**
   * Coach/match-demand target week total when a non-baseline mode is active.
   * Null in baseline mode or when the target for this KPI is unavailable.
   */
  targetWeekTotal?: number | null;
  /** currentTotal / targetWeekTotal × 100 (null when no target). */
  pctOfTarget?: number | null;
};

/** Non-baseline target metadata attached to the weekly load result. */
export type WeeklyLoadTargetMeta = {
  mode: "baseline" | "match_demand" | "coach_weekly";
  corridorPct: number;
  mesocyclePhase: "build" | "maintain" | "taper" | null;
  mesocycleMultiplier: number;
  matchesSampled?: number;
  matchDemandAvg?: Partial<Record<WeeklyLoadMetricKey, number>>;
  templateWeekSum?: Partial<Record<WeeklyLoadMetricKey, number>>;
  /** Number of player-match rows included after the FULL-game filter. */
  fullMatchRowsUsed?: number;
  /** Number of player-match rows skipped because the player did not play enough. */
  rowsSkippedPartial?: number;
  /** Minimum minutes threshold used for the FULL filter. */
  minMinutesUsed?: number;
};

export type WeeklyLoadResult = {
  teamId: string;
  weekMonday: string;
  weekSunday: string;
  today: string;
  daysElapsed: number;
  totalWeekDays: number;
  days: WeeklyLoadDay[];
  metrics: WeeklyLoadMetricSummary[];
  historicalWeeksUsed: number;
  /** Target metadata from team_load_targets. Present even in baseline mode. */
  target?: WeeklyLoadTargetMeta;
};

/**
 * Weekly Load Tracker — shared types (client-safe).
 *
 * Two parallel KPI sets are supported so the card works in both outdoor GPS
 * and indoor FMP modes:
 *
 *   OUTDOOR (6 KPIs) — classic GPS metrics:
 *     totalDistance, totalPlayerLoad, velocityBand5, velocityBand6,
 *     accelB23, decelB23
 *
 *   INDOOR  (5 KPIs) — Football Movement Profile + IMA (sensor-only, no GPS):
 *     totalPlayerLoad, fmpDynamicHigh, fmpDynamicMedium, fmpRunningHigh,
 *     imaTotal
 *
 * The active list is selected per-team via `team_settings.indoor_mode`.
 * totalPlayerLoad is shared across both lists so it remains a stable anchor
 * when a team switches between outdoor and indoor training.
 */

// ─── Outdoor (GPS) KPI list ────────────────────────────────────────────────

export const WEEKLY_LOAD_METRICS_OUTDOOR = [
  "totalDistance",
  "totalPlayerLoad",
  "velocityBand5",
  "velocityBand6",
  "accelB23",
  "decelB23",
] as const;

// ─── Indoor (FMP / IMA) KPI list ───────────────────────────────────────────

export const WEEKLY_LOAD_METRICS_INDOOR = [
  "totalPlayerLoad",
  "fmpDynamicHigh",
  "fmpDynamicMedium",
  "fmpRunningHigh",
  "imaTotal",
] as const;

/**
 * Back-compat default export. Existing server code that imports
 * `WEEKLY_LOAD_METRICS` continues to get the outdoor set. New code that
 * needs to switch should call `getActiveWeeklyLoadMetrics(indoor)`.
 */
export const WEEKLY_LOAD_METRICS = WEEKLY_LOAD_METRICS_OUTDOOR;

export type WeeklyLoadMetricKey =
  | (typeof WEEKLY_LOAD_METRICS_OUTDOOR)[number]
  | (typeof WEEKLY_LOAD_METRICS_INDOOR)[number];

/** Return the active KPI list for a given indoor flag. */
export function getActiveWeeklyLoadMetrics(indoor: boolean): readonly WeeklyLoadMetricKey[] {
  return indoor ? WEEKLY_LOAD_METRICS_INDOOR : WEEKLY_LOAD_METRICS_OUTDOOR;
}

/**
 * Full set of KPI keys — used when we need to iterate over every possible
 * metric (e.g. validating incoming JSON payloads, building defaults).
 */
export const ALL_WEEKLY_LOAD_METRICS: readonly WeeklyLoadMetricKey[] = [
  ...WEEKLY_LOAD_METRICS_OUTDOOR,
  // Only add indoor keys that are NOT already in the outdoor list
  ...WEEKLY_LOAD_METRICS_INDOOR.filter(
    (k) => !(WEEKLY_LOAD_METRICS_OUTDOOR as readonly string[]).includes(k)
  ),
] as const;

// ─── Labels ────────────────────────────────────────────────────────────────

export const WEEKLY_LOAD_LABELS: Record<WeeklyLoadMetricKey, { en: string; is: string; unit: string }> = {
  // Outdoor
  totalDistance:    { en: "Total Distance",  is: "Heildarvegalengd",  unit: "m" },
  totalPlayerLoad:  { en: "Player Load",     is: "Player Load",       unit: "" },
  velocityBand5:    { en: "Vel Band 5",      is: "Hraðaband 5",       unit: "m" },
  velocityBand6:    { en: "Vel Band 6",      is: "Hraðaband 6",       unit: "m" },
  accelB23:         { en: "Accel B2-3",      is: "Hröðun B2-3",       unit: "#" },
  decelB23:         { en: "Decel B2-3",      is: "Hægðun B2-3",       unit: "#" },
  // Indoor (FMP / IMA)
  fmpDynamicHigh:   { en: "FMP Dyn High",    is: "FMP Dynamic High",  unit: "s" },
  fmpDynamicMedium: { en: "FMP Dyn Med",     is: "FMP Dynamic Med",   unit: "s" },
  fmpRunningHigh:   { en: "FMP Run High",    is: "FMP Running High",  unit: "s" },
  imaTotal:         { en: "IMA Total",       is: "IMA Total",         unit: "#" },
};

// ─── Shared result types ───────────────────────────────────────────────────

export type WeeklyLoadDay = {
  date: string;
  dayLabel: string;
  dayOfWeek: number; // 0=Sun .. 6=Sat
  metrics: Partial<Record<WeeklyLoadMetricKey, number | null>>;
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
  /** Indoor mode flag (KPI list + FMP/IMA-based match demand). */
  indoor?: boolean;
  /** True when the baseline "typical week" rollup excluded detected match days. */
  baselineExcludesMatchDays?: boolean;
  /** Number of detected match dates removed from the historical baseline window. */
  baselineMatchDatesExcluded?: number;
  /** Number of player-day rows filtered out because their date was a match day. */
  baselineRowsExcluded?: number;
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
  /** Indoor mode for this team (echoed for UI convenience). */
  indoor?: boolean;
  /** Active KPI keys for this team (indoor vs outdoor subset). */
  activeMetrics?: readonly WeeklyLoadMetricKey[];
};

type MetricSource = Record<string, unknown> | null | undefined;

export type CatapultMetricKey =
  | "totalDistance"
  | "velocityBand5TotalDistance"
  | "velocityBand6TotalDistance"
  | "velocityBand4TotalEffortsGen2"
  | "velocityBand5TotalEffortsGen2"
  | "velocityBand6TotalEffortsGen2"
  | "hirDist"
  | "maxVelocity"
  | "accelB23TotEffsGen2"
  | "totAs"
  | "decelB23TotEffsGen2"
  | "totDs"
  | "totalPlayerLoad"
  | "avgHeartRate"
  | "maxHeartRate"
  | "minHeartRate"
  | "hrZone1TimeS"
  | "hrZone2TimeS"
  | "hrZone3TimeS"
  | "hrZone4TimeS"
  | "hrZone5TimeS"
  | "hrZone6TimeS"
  | "hrZone7TimeS"
  | "hrZone8TimeS"
  | "pctMaxHeartRate"
  | "pctAvgHeartRate";

export type CatapultMetricDefinition = {
  key: CatapultMetricKey;
  label: string;
  digits?: number;
  required?: boolean;
  acwrSupported?: boolean;
  aliases: string[];
};

export type CatapultWeeklyMetricSnapshot = {
  acute7Avg: number | null;
  chronic28Avg: number | null;
  acwr: number | null;
};

const METRIC_DEFINITIONS: readonly CatapultMetricDefinition[] = [
  { key: "totalDistance", label: "Distance / Session (m)", digits: 0, acwrSupported: true, aliases: ["total_distance", "totalDistance"] },
  {
    key: "velocityBand5TotalDistance",
    label: "Vel B5 Avg Dist (Sess) (m)",
    digits: 0,
    acwrSupported: true,
    aliases: ["velocity_band5_total_distance", "velocityBand5TotalDistance"],
  },
  {
    key: "velocityBand6TotalDistance",
    label: "Vel B6 Avg Dist (Sess) (m)",
    digits: 0,
    acwrSupported: true,
    aliases: ["velocity_band6_total_distance", "velocityBand6TotalDistance"],
  },
  {
    key: "velocityBand6TotalEffortsGen2",
    label: "Sprint Efforts (#)",
    digits: 0,
    acwrSupported: true,
    aliases: [
      // PRIMARY — exact OpenField parameter name confirmed in Reporting_Parameters (25 Apr 2026)
      "Sprint Efforts",
      // Snake_case variants Catapult sometimes returns
      "sprint_efforts",
      "sprintEfforts",
      // Legacy display-name guesses (kept as fallback)
      "Velocity B6+ Total # Efforts (Gen 2)",
      "velocity_band_6_plus_total_effort_count_set_2",
      "velocity_band6_total_effort_count_gen2",
      "velocity_band6_plus_total_efforts_gen2",
      "vb6_plus_total_efforts_gen2",
      "velocityBand6TotalEffortsGen2",
      "vel_b6_total_efforts_gen2",
    ],
  },
  {
    key: "velocityBand5TotalEffortsGen2",
    label: "HS Efforts (#)",
    digits: 0,
    acwrSupported: true,
    aliases: [
      // PRIMARY — High-Speed Efforts parameter from OpenField (25 Apr 2026)
      "HS Efforts",
      "hs_efforts",
      "high_speed_efforts",
      // Legacy display-name guesses
      "Velocity B5+ Total # Efforts (Gen 2)",
      "velocity_band_5_plus_total_effort_count_set_2",
      "velocity_band5_total_effort_count_gen2",
      "velocity_band5_plus_total_efforts_gen2",
      "vb5_plus_total_efforts_gen2",
      "velocityBand5TotalEffortsGen2",
      "vel_b5_total_efforts_gen2",
    ],
  },
  {
    key: "velocityBand4TotalEffortsGen2",
    label: "Vel B4+ Total # Efforts (Gen 2)",
    digits: 0,
    aliases: [
      "velocity_band_4_plus_total_effort_count_set_2",
      "velocity_band4_total_effort_count_gen2",
      "velocityBand4TotalEffortsGen2",
    ],
  },
  // HIR Dist = High-Intensity Running distance. Catapult sometimes leaves
  // `hir_dist` empty/zero, in which case getCatapultMetricValue() falls back
  // to summing velocity band 5 + band 6 distance — the standard sport-science
  // definition of HIR. Players see one consolidated HIR tile instead of
  // three near-identical Vel B5 / Vel B6 / HIR boxes.
  { key: "hirDist", label: "HIR Dist (m)", digits: 0, acwrSupported: true, aliases: ["hir_dist", "hirDist"] },
  { key: "maxVelocity", label: "Max Vel (km/h)", digits: 1, aliases: ["max_vel", "max_velocity", "maxVel", "maxVelocity"] },
  {
    key: "accelB23TotEffsGen2",
    label: "Acceleration B2-3 Total Efforts (Gen 2)",
    digits: 0,
    required: true,
    acwrSupported: true,
    aliases: ["accel_b2_3_tot_effs_gen2", "accelB23TotEffsGen2", "accelBand2to3Efforts"],
  },
  {
    key: "totAs",
    label: "Tot Accels (#)",
    digits: 0,
    required: true,
    acwrSupported: true,
    aliases: ["tot_as", "totAs", "totalAccelerations"],
  },
  {
    key: "decelB23TotEffsGen2",
    label: "Deceleration B2-3 Total Efforts (Gen 2)",
    digits: 0,
    required: true,
    acwrSupported: true,
    aliases: ["decel_b2_3_tot_effs_gen2", "decelB23TotEffsGen2", "decelBand2to3Efforts"],
  },
  {
    key: "totDs",
    label: "Tot Decels (#)",
    digits: 0,
    required: true,
    acwrSupported: true,
    aliases: ["tot_ds", "totDs", "totalDecelerations"],
  },
  {
    key: "totalPlayerLoad",
    label: "Total Player Load",
    digits: 0,
    acwrSupported: true,
    aliases: ["total_player_load", "player_load", "totalPlayerLoad", "playerLoad"],
  },
  {
    key: "avgHeartRate",
    label: "Avg HR (bpm)",
    digits: 0,
    aliases: ["avg_heart_rate", "average_heart_rate", "heart_rate_avg", "avgHeartRate"],
  },
  {
    key: "maxHeartRate",
    label: "Max HR (bpm)",
    digits: 0,
    aliases: ["max_heart_rate", "maximum_heart_rate", "heart_rate_max", "maxHeartRate"],
  },
  {
    key: "hrZone1TimeS",
    label: "HR Zone 1 (s)",
    digits: 0,
    aliases: ["hr_zone_1_time_s", "hr_zone1_time_s", "hrZone1TimeS", "hrz_1_duration"],
  },
  {
    key: "hrZone2TimeS",
    label: "HR Zone 2 (s)",
    digits: 0,
    aliases: ["hr_zone_2_time_s", "hr_zone2_time_s", "hrZone2TimeS", "hrz_2_duration"],
  },
  {
    key: "hrZone3TimeS",
    label: "HR Zone 3 (s)",
    digits: 0,
    aliases: ["hr_zone_3_time_s", "hr_zone3_time_s", "hrZone3TimeS", "hrz_3_duration"],
  },
  {
    key: "hrZone4TimeS",
    label: "HR Zone 4 (s)",
    digits: 0,
    aliases: ["hr_zone_4_time_s", "hr_zone4_time_s", "hrZone4TimeS", "hrz_4_duration"],
  },
  {
    key: "hrZone5TimeS",
    label: "HR Zone 5 (s)",
    digits: 0,
    aliases: ["hr_zone_5_time_s", "hr_zone5_time_s", "hrZone5TimeS", "hrz_5_duration"],
  },
  {
    key: "hrZone6TimeS",
    label: "HR Zone 6 (s)",
    digits: 0,
    aliases: ["hr_zone_6_time_s", "hr_zone6_time_s", "hrZone6TimeS"],
  },
  {
    key: "hrZone7TimeS",
    label: "HR Zone 7 (s)",
    digits: 0,
    aliases: ["hr_zone_7_time_s", "hr_zone7_time_s", "hrZone7TimeS"],
  },
  {
    key: "hrZone8TimeS",
    label: "HR Zone 8 (s)",
    digits: 0,
    aliases: ["hr_zone_8_time_s", "hr_zone8_time_s", "hrZone8TimeS"],
  },
  {
    key: "minHeartRate",
    label: "Min HR (bpm)",
    digits: 0,
    aliases: ["min_heart_rate", "minimum_heart_rate", "heart_rate_min", "minHeartRate"],
  },
  {
    key: "pctMaxHeartRate",
    label: "% HRmax",
    digits: 0,
    aliases: ["pct_max_heart_rate", "percentage_max_heart_rate", "pctMaxHeartRate"],
  },
  {
    key: "pctAvgHeartRate",
    label: "% HRavg",
    digits: 0,
    aliases: ["pct_avg_heart_rate", "percentage_avg_heart_rate", "pctAvgHeartRate"],
  },
] as const;

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getCatapultMetricDefinitions(): readonly CatapultMetricDefinition[] {
  return METRIC_DEFINITIONS;
}

// VB5 and VB6 are kept as their own tiles — coaches need to see the
// breakdown between high-speed (band 5) and sprint (band 6) distance, not
// just the combined HIR total. HIR Dist sits alongside them and now
// auto-computes as VB5+VB6 when Catapult leaves hir_dist at 0.
export function getDefaultCatapultTodayVsTeamMetricKeys(): CatapultMetricKey[] {
  return [
    "accelB23TotEffsGen2",
    "totAs",
    "decelB23TotEffsGen2",
    "totDs",
    "velocityBand5TotalDistance",
    "velocityBand6TotalDistance",
    "hirDist",
    "maxVelocity",
    "totalPlayerLoad",
    "totalDistance",
  ];
}

export function getDefaultCatapultWeeklyLoadMetricKeys(): CatapultMetricKey[] {
  return [
    "accelB23TotEffsGen2",
    "totAs",
    "decelB23TotEffsGen2",
    "totDs",
    "velocityBand5TotalDistance",
    "velocityBand6TotalDistance",
    "hirDist",
    "totalPlayerLoad",
    "totalDistance",
  ];
}

export function getCatapultMetricDefinition(key: CatapultMetricKey): CatapultMetricDefinition {
  const found = METRIC_DEFINITIONS.find((metric) => metric.key === key);
  if (!found) throw new Error(`Unknown Catapult metric key: ${key}`);
  return found;
}

export function getCatapultMetricValue(source: MetricSource, key: CatapultMetricKey): number | null {
  if (!source) return null;
  const definition = getCatapultMetricDefinition(key);
  for (const alias of definition.aliases) {
    const value = asNumber(source[alias]);
    if (value != null && value > 0) return value;
  }
  // HIR Dist fallback: Catapult often leaves hir_dist at 0 even when the
  // session has high-intensity running. Compute it as velocity band 5 +
  // band 6 distance (the standard sport-science definition).
  if (key === "hirDist") {
    const b5 = asNumber(source["velocity_band5_total_distance"]) ?? asNumber(source["velocityBand5TotalDistance"]);
    const b6 = asNumber(source["velocity_band6_total_distance"]) ?? asNumber(source["velocityBand6TotalDistance"]);
    if (b5 != null || b6 != null) {
      return (b5 ?? 0) + (b6 ?? 0);
    }
  }
  // Otherwise, fall back to any alias even if zero
  for (const alias of definition.aliases) {
    const value = asNumber(source[alias]);
    if (value != null) return value;
  }
  return null;
}

export function computeCatapultMetricAverage(rows: MetricSource[], key: CatapultMetricKey): number | null {
  return average(
    rows
      .map((row) => getCatapultMetricValue(row, key))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  );
}

export function computeCatapultWeeklyMetricSnapshot(args: {
  rows: MetricSource[];
  key: CatapultMetricKey;
}): CatapultWeeklyMetricSnapshot {
  const datedRows = args.rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === "object")
    .filter((row) => typeof row.date === "string")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const acuteRows = datedRows.slice(-7);
  const chronicRows = datedRows.slice(-28);
  const acute7Avg = computeCatapultMetricAverage(acuteRows, args.key);
  const chronic28Avg = computeCatapultMetricAverage(chronicRows, args.key);
  const acwr =
    getCatapultMetricDefinition(args.key).acwrSupported && typeof acute7Avg === "number" && typeof chronic28Avg === "number" && chronic28Avg > 0
      ? acute7Avg / chronic28Avg
      : null;

  return {
    acute7Avg,
    chronic28Avg,
    acwr,
  };
}

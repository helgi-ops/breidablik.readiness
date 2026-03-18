type MetricSource = Record<string, unknown> | null | undefined;

export type CatapultMetricKey =
  | "totalDistance"
  | "velocityBand5TotalDistance"
  | "velocityBand6TotalDistance"
  | "hirDist"
  | "maxVelocity"
  | "accelB23TotEffsGen2"
  | "totAs"
  | "decelB23TotEffsGen2"
  | "totDs"
  | "totalPlayerLoad";

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
  { key: "totalDistance", label: "Avg Dist (m)", digits: 0, acwrSupported: true, aliases: ["total_distance", "totalDistance"] },
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

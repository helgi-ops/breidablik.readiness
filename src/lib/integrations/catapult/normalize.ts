import type { CatapultSessionMetric, NormalizedExternalLoad } from "./types";

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const trimmed = value.trim();
    const direct = Number(trimmed);
    if (Number.isFinite(direct)) return direct;

    const normalizedThousands = trimmed.replace(/\s+/g, "").replace(/,(?=\d{3}\b)/g, "");
    const thousandsParsed = Number(normalizedThousands);
    if (Number.isFinite(thousandsParsed)) return thousandsParsed;

    const normalizedDecimal =
      normalizedThousands.includes(",") && !normalizedThousands.includes(".")
        ? normalizedThousands.replace(",", ".")
        : normalizedThousands;
    const decimalParsed = Number(normalizedDecimal);
    if (Number.isFinite(decimalParsed)) return decimalParsed;

    const numericFragment = normalizedDecimal.match(/-?\d+(?:[.,]\d+)?/);
    if (!numericFragment) return null;
    const parsed = Number(numericFragment[0].replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toInteger(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed == null ? null : Math.round(parsed);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function firstNonEmptyArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const candidate = asArray(record[key]);
    if (candidate.length) return candidate;
  }
  return [];
}

const LABEL_KEYS = ["name", "label", "parameter", "parameter_name", "metric", "metric_name", "key", "title", "display_name"] as const;
const VALUE_KEYS = [
  "value",
  "result",
  "stat",
  "count",
  "total",
  "amount",
  "metric_value",
  "display_value",
  "formatted_value",
  "displayValue",
  "formattedValue",
] as const;

function canonicalKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function findStringByKeys(value: unknown, keys: readonly string[], depth = 0): string | null {
  if (depth > 3) return null;
  const record = asRecord(value);
  if (!record) return null;

  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim().length) return candidate.trim();
  }

  for (const candidate of Object.values(record)) {
    const nested = findStringByKeys(candidate, keys, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function findNumberByKeys(value: unknown, keys: readonly string[], depth = 0): number | null {
  if (depth > 3) return null;
  const record = asRecord(value);
  if (!record) return null;

  for (const key of keys) {
    const candidate = toNumber(record[key]);
    if (candidate != null) return candidate;
  }

  for (const candidate of Object.values(record)) {
    const nested = findNumberByKeys(candidate, keys, depth + 1);
    if (nested != null) return nested;
  }

  return null;
}

export function flattenMetricRecord(input: Record<string, unknown>, prefix = "", depth = 0, out?: Record<string, unknown>): Record<string, unknown> {
  const target = out ?? {};
  if (depth > 4) return target;

  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const numeric = toNumber(value);
    if (numeric != null) {
      target[path] = numeric;
      target[key] = numeric;
      continue;
    }

    if (typeof value === "string" && value.trim().length) {
      target[path] = value;
      target[key] = value;
      continue;
    }

    const nestedRecord = asRecord(value);
    if (nestedRecord) {
      const label = findStringByKeys(nestedRecord, LABEL_KEYS);
      const metricValue = findNumberByKeys(nestedRecord, VALUE_KEYS);
      if (typeof label === "string" && metricValue != null) {
        target[label] = metricValue;
        target[`${path}.${label}`] = metricValue;
      }

      flattenMetricRecord(nestedRecord, path, depth + 1, target);
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (depth > 4) return;
        const itemPath = `${path}[${index}]`;
        const itemNumber = toNumber(item);
        if (itemNumber != null) {
          target[itemPath] = itemNumber;
          return;
        }
        const itemRecord = asRecord(item);
        if (!itemRecord) return;
        const label = findStringByKeys(itemRecord, LABEL_KEYS);
        const metricValue = findNumberByKeys(itemRecord, VALUE_KEYS);
        if (typeof label === "string" && metricValue != null) {
          target[label] = metricValue;
          target[`${itemPath}.${label}`] = metricValue;
        }
        flattenMetricRecord(itemRecord, itemPath, depth + 1, target);
      });
    }
  }

  return target;
}

type MetricEntry = {
  key: string;
  canonical: string;
  value: number;
};

function metricEntries(record: Record<string, unknown>): MetricEntry[] {
  return Object.entries(record)
    .map(([key, raw]) => {
      const value = toNumber(raw);
      if (value == null) return null;
      return { key, canonical: canonicalKey(key), value };
    })
    .filter((item): item is MetricEntry => item != null);
}

function buildCanonicalMap(record: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    map.set(canonicalKey(key), value);
  }
  return map;
}

function extractMetric(record: Record<string, unknown>, keys: string[]): number | null {
  const canonicalMap = buildCanonicalMap(record);
  let zeroCandidate: number | null = null;

  for (const key of keys) {
    const value = toNumber(record[key] ?? canonicalMap.get(canonicalKey(key)));
    if (value == null) continue;
    if (value !== 0) return value;
    if (zeroCandidate == null) {
      zeroCandidate = 0;
    }
  }

  return zeroCandidate;
}

function findMatchingEntries(record: Record<string, unknown>, matcher: (entry: MetricEntry) => boolean): MetricEntry[] {
  return metricEntries(record).filter(matcher);
}

function preferCountLike(entries: MetricEntry[]): MetricEntry[] {
  const countLike = entries.filter(
    (entry) =>
      entry.canonical.includes("count") ||
      entry.canonical.includes("total") ||
      entry.canonical.includes("effort"),
  );
  return countLike.length ? countLike : entries;
}

function sumEntries(entries: MetricEntry[]): number | null {
  if (!entries.length) return null;
  return entries.reduce((sum, entry) => sum + entry.value, 0);
}

function nullIfZero(value: number | null): number | null {
  return value === 0 ? null : value;
}

export function extractInterestingMetricKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record)
    .filter((key) => /(ima|accel|decel|cod|impact|playerload|duration|metabolic|hml|energy)/i.test(key))
    .sort((a, b) => a.localeCompare(b));
}

// ─── Metabolic metrics extraction ──────────────────────────────────────────

const METABOLIC_AVG_POWER_KEYS = [
  // Catapult OpenField display-name variants (as returned by Stats API v6)
  "Metabolic Power Avg",
  "Avg Metabolic Power",
  "Average Metabolic Power",
  // Catapult fmp_* snake_case keys (returned by Stats API v6 with requested_only:false)
  "fmp_average_power",
  "fmp_w_kg_average",
  "fmp_avg_power",
  "fmp_average",
  "fmp_power_average",
  // Other snake_case / camelCase variants
  "metabolic_power_avg",
  "average_metabolic_power",
  "avg_metabolic_power",
  "metabolic_power_average",
  "metabolic_power_w_kg_avg",
  "metabolic_power",
  "metabolicPower",
  "meta_power_avg",
];

const METABOLIC_PEAK_POWER_KEYS = [
  // Exact Catapult OpenField display-name (confirmed from Reporting_Parameters)
  "Peak Meta Power",
  // Other display-name variants
  "Metabolic Power Max",
  "Max Metabolic Power",
  "Peak Metabolic Power",
  // Catapult fmp_* snake_case keys (returned by Stats API v6 with requested_only:false)
  "fmp_peak_power",
  "fmp_w_kg_peak",
  "fmp_peak",
  "fmp_max_power",
  "fmp_w_kg_max",
  "fmp_maximum_power",
  // Other snake_case / camelCase variants
  "metabolic_power_peak",
  "peak_metabolic_power",
  "max_metabolic_power",
  "metabolic_power_w_kg_peak",
  "peak_meta_power",
  "peakMetaPower",
];

const HMLD_KEYS = [
  // Exact Catapult OpenField display-names (confirmed from Timeline 27 Mar 2026)
  "High Metabolic Load Dist (m)",  // exact UI label including unit suffix
  "High Metabolic Load Dist",      // without unit suffix
  "High Metabolic Load Distance",  // longer variant
  "High Metabolic Power Distance",
  // Catapult fmp_* snake_case keys (returned by Stats API v6 with requested_only:false)
  "fmp_dynamic_high_total_distance",
  "fmp_high_total_distance",
  "fmp_distance_high",
  "fmp_high_distance",
  "fmp_dynamic_high_distance",
  // Other snake_case / camelCase variants
  "high_metabolic_load_distance",
  "hmld",
  "hml_distance",
  "high_metabolic_power_distance",
  "distance_above_25_5_w_kg",
  "highMetabolicLoadDistance",
  "hml_dist",
];

const METABOLIC_ENERGY_KEYS = [
  // Exact Catapult OpenField display-names (confirmed from Reporting_Parameters)
  "Meta Energy (KJ/kg)",        // primary — confirmed in Reporting_Parameters settings
  "Meta Energy (Cal/kg)",       // fallback in case of unit display preference
  // Other display-name variants
  "Metabolic Energy",
  "Energy Expenditure",
  "Meta Energy",
  // Catapult fmp_* snake_case keys (returned by Stats API v6 with requested_only:false)
  "fmp_energy_kj_kg",
  "fmp_energy",
  "fmp_energy_kj",
  "fmp_energy_expenditure",
  "fmp_energy_cal_kg",
  // Other snake_case / camelCase variants
  "metabolic_energy",
  "energy_kj",
  "energy_expenditure_kj",
  "meta_energy",
  "metaEnergy",
];

const TIME_ABOVE_HML_KEYS = [
  // Catapult OpenField display-name variants
  "Time In High Metabolic Zone",
  "Time In HML Zone",
  "High Metabolic Load Duration",
  "Time Above HML Threshold",
  // Catapult fmp_* snake_case keys (confirmed in metabolic-only row: 371.07s)
  "fmp_dynamic_high_duration",
  "fmp_high_duration",
  "fmp_dynamic_high_total_duration",
  "fmp_high_total_duration",
  // Other snake_case / camelCase variants
  "time_above_hml_threshold",
  "hml_time",
  "time_above_25_5_w_kg",
  "high_metabolic_load_time",
  "timeAboveHmlThreshold",
  "time_in_high_metabolic_zone",
];

const METABOLIC_GEN_KEYS = [
  "metabolic_power_gen",
  "metabolic_power_version",
  "gen2_metabolic_power",
  "metabolic_power_model",
];

// ─── Heart Rate metric keys ─────────────────────────────────────────────────

const AVG_HEART_RATE_KEYS = [
  // Catapult OpenField display-name variants
  "Heart Rate Avg",
  "Average Heart Rate",
  "Avg Heart Rate",
  "HR Average",
  "HR Avg",
  // snake_case / camelCase
  "avg_heart_rate",
  "average_heart_rate",
  "heart_rate_avg",
  "hr_avg",
  "hr_average",
  "avgHeartRate",
  "averageHeartRate",
];

const MAX_HEART_RATE_KEYS = [
  // Catapult OpenField display-name variants
  "Heart Rate Max",
  "Maximum Heart Rate",
  "Max Heart Rate",
  "HR Maximum",
  "HR Max",
  // snake_case / camelCase
  "max_heart_rate",
  "maximum_heart_rate",
  "heart_rate_max",
  "hr_max",
  "hr_maximum",
  "maxHeartRate",
  "maximumHeartRate",
];

const HR_ZONE_KEYS: Record<1 | 2 | 3 | 4 | 5, string[]> = {
  1: [
    "Heart Rate Zone 1 Duration",
    "HR Zone 1 Duration",
    "HR Zone 1 Time",
    "heart_rate_zone_1_duration",
    "hr_zone_1_duration",
    "hrz_1_duration",
    "zone1duration",
    "hr_zone1_s",
    "heart_rate_z1_duration",
  ],
  2: [
    "Heart Rate Zone 2 Duration",
    "HR Zone 2 Duration",
    "HR Zone 2 Time",
    "heart_rate_zone_2_duration",
    "hr_zone_2_duration",
    "hrz_2_duration",
    "zone2duration",
    "hr_zone2_s",
    "heart_rate_z2_duration",
  ],
  3: [
    "Heart Rate Zone 3 Duration",
    "HR Zone 3 Duration",
    "HR Zone 3 Time",
    "heart_rate_zone_3_duration",
    "hr_zone_3_duration",
    "hrz_3_duration",
    "zone3duration",
    "hr_zone3_s",
    "heart_rate_z3_duration",
  ],
  4: [
    "Heart Rate Zone 4 Duration",
    "HR Zone 4 Duration",
    "HR Zone 4 Time",
    "heart_rate_zone_4_duration",
    "hr_zone_4_duration",
    "hrz_4_duration",
    "zone4duration",
    "hr_zone4_s",
    "heart_rate_z4_duration",
  ],
  5: [
    "Heart Rate Zone 5 Duration",
    "HR Zone 5 Duration",
    "HR Zone 5 Time",
    "heart_rate_zone_5_duration",
    "hr_zone_5_duration",
    "hrz_5_duration",
    "zone5duration",
    "hr_zone5_s",
    "heart_rate_z5_duration",
  ],
};

export function extractHeartRateMetrics(record: Record<string, unknown>): {
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  hrZone1TimeS: number | null;
  hrZone2TimeS: number | null;
  hrZone3TimeS: number | null;
  hrZone4TimeS: number | null;
  hrZone5TimeS: number | null;
} {
  const avgHeartRate = nullIfZero(sanitiseMetabolicValue(extractMetric(record, AVG_HEART_RATE_KEYS), 30, 220));
  const maxHeartRate = nullIfZero(sanitiseMetabolicValue(extractMetric(record, MAX_HEART_RATE_KEYS), 30, 230));
  const hrZone1TimeS = nullIfZero(sanitiseMetabolicValue(extractMetric(record, HR_ZONE_KEYS[1]), 0, 14_400));
  const hrZone2TimeS = nullIfZero(sanitiseMetabolicValue(extractMetric(record, HR_ZONE_KEYS[2]), 0, 14_400));
  const hrZone3TimeS = nullIfZero(sanitiseMetabolicValue(extractMetric(record, HR_ZONE_KEYS[3]), 0, 14_400));
  const hrZone4TimeS = nullIfZero(sanitiseMetabolicValue(extractMetric(record, HR_ZONE_KEYS[4]), 0, 14_400));
  const hrZone5TimeS = nullIfZero(sanitiseMetabolicValue(extractMetric(record, HR_ZONE_KEYS[5]), 0, 14_400));
  return { avgHeartRate, maxHeartRate, hrZone1TimeS, hrZone2TimeS, hrZone3TimeS, hrZone4TimeS, hrZone5TimeS };
}

/** Returns the first matching string value for generation tag, else null. */
function extractStringField(record: Record<string, unknown>, keys: string[]): string | null {
  const canonicalMap = buildCanonicalMap(record);
  for (const key of keys) {
    const raw = record[key] ?? canonicalMap.get(canonicalKey(key));
    if (typeof raw === "string" && raw.trim().length) return raw.trim();
  }
  return null;
}

/**
 * Clamps a value to a plausible range and returns null for obviously corrupt inputs.
 * Metabolic power for field sport athletes: 0–60 W/kg is generous.
 * HMLD: 0–15 000 m per session is generous.
 * Energy: 0–8 000 kJ per session is generous.
 * Time above threshold: 0–7 200 s (2 h) per session.
 */
function sanitiseMetabolicValue(value: number | null, min: number, max: number): number | null {
  if (value == null) return null;
  if (value < min || value > max) return null; // outside realistic range → treat as corrupt
  return value;
}

export function extractMetabolicMetrics(record: Record<string, unknown>): {
  metabolicPower: number | null;
  metabolicPowerPeak: number | null;
  highMetabolicLoadDistanceM: number | null;
  metabolicEnergyKj: number | null;
  timeAboveHmlThresholdS: number | null;
  metabolicPowerGen: string | null;
  metabolicDataValid: boolean;
} {
  const rawAvg = nullIfZero(extractMetric(record, METABOLIC_AVG_POWER_KEYS));
  const rawPeak = nullIfZero(extractMetric(record, METABOLIC_PEAK_POWER_KEYS));
  const rawHmld = nullIfZero(extractMetric(record, HMLD_KEYS));
  const rawEnergy = nullIfZero(extractMetric(record, METABOLIC_ENERGY_KEYS));
  const rawTime = nullIfZero(extractMetric(record, TIME_ABOVE_HML_KEYS));
  const rawGen = extractStringField(record, METABOLIC_GEN_KEYS);

  // Average metabolic power for a field-sport session: typically 5–25 W/kg.
  // Peak metabolic power during sprint efforts: commonly 60–150 W/kg.
  // Use generous ceilings to avoid silently dropping real data.
  const metabolicPower = sanitiseMetabolicValue(rawAvg, 0, 150);
  const metabolicPowerPeak = sanitiseMetabolicValue(rawPeak, 0, 300);
  const highMetabolicLoadDistanceM = sanitiseMetabolicValue(rawHmld, 0, 15_000);
  const metabolicEnergyKj = sanitiseMetabolicValue(rawEnergy, 0, 8_000);
  const timeAboveHmlThresholdS = sanitiseMetabolicValue(rawTime, 0, 7_200);

  const hasAnyMetabolicValue =
    metabolicPower != null ||
    metabolicPowerPeak != null ||
    highMetabolicLoadDistanceM != null ||
    metabolicEnergyKj != null ||
    timeAboveHmlThresholdS != null;

  // Infer generation from key names found in record or explicit gen field
  let metabolicPowerGen: string | null = rawGen ?? null;
  if (!metabolicPowerGen && hasAnyMetabolicValue) {
    const allKeys = Object.keys(record).join(" ").toLowerCase();
    if (allKeys.includes("gen2") || allKeys.includes("gen_2")) metabolicPowerGen = "gen2";
    else if (metabolicPower != null || metabolicPowerPeak != null) metabolicPowerGen = "gen1";
  }

  // Valid if at least one major metabolic field contains a positive value
  const metabolicDataValid =
    (metabolicPower != null && metabolicPower > 0) ||
    (highMetabolicLoadDistanceM != null && highMetabolicLoadDistanceM > 0) ||
    (metabolicEnergyKj != null && metabolicEnergyKj > 0);

  return {
    metabolicPower,
    metabolicPowerPeak,
    highMetabolicLoadDistanceM,
    metabolicEnergyKj,
    timeAboveHmlThresholdS,
    metabolicPowerGen,
    metabolicDataValid,
  };
}

function extractAthleteId(record: Record<string, unknown>): string | null {
  const direct = record.athleteId ?? record.athlete_id ?? record.player_id ?? record.id;
  return typeof direct === "string" && direct.trim().length ? direct.trim() : null;
}

function extractActivityId(record: Record<string, unknown>): string | null {
  const direct = record.activityId ?? record.activity_id ?? record.session_id ?? record.practice_id;
  return typeof direct === "string" && direct.trim().length ? direct.trim() : null;
}

function normalizeImaMetrics(record: Record<string, unknown>, playerLoad: number | null) {
  // OpenField reporting/export availability may depend on Reporting_Parameters group configuration in Catapult.
  const accelEntries = preferCountLike(
    findMatchingEntries(
      record,
      (entry) =>
        entry.canonical.includes("ima") &&
        entry.canonical.includes("accel") &&
        !entry.canonical.includes("decel") &&
        !entry.canonical.includes("cod") &&
        !entry.canonical.includes("playerload"),
    ),
  );

  const decelEntries = preferCountLike(
    findMatchingEntries(record, (entry) => entry.canonical.includes("ima") && entry.canonical.includes("decel")),
  );

  const codEntries = preferCountLike(
    findMatchingEntries(record, (entry) => entry.canonical.includes("ima") && entry.canonical.includes("cod")),
  );

  const impactEntries = preferCountLike(
    findMatchingEntries(record, (entry) => entry.canonical.includes("ima") && entry.canonical.includes("impact")),
  );

  const directImaTotal = nullIfZero(extractMetric(record, ["ima_total_efforts", "ima_total", "ima_efforts_total"]));
  const directCodEvents = nullIfZero(
    extractMetric(record, ["cod_events", "change_of_direction_events", "change_of_direction_count"]),
  );
  const directPlayerLoadPerMin = extractMetric(record, ["player_load_per_minute", "playerload_per_min", "playerloadperminute"]);
  const durationMinutes = extractMetric(record, ["duration_minutes", "durationminutes", "session_duration_minutes"]);

  const imaAccel = nullIfZero(toInteger(sumEntries(accelEntries)));
  const imaDecel = nullIfZero(toInteger(sumEntries(decelEntries)));
  const imaCod = nullIfZero(toInteger(sumEntries(codEntries)));
  const impacts = nullIfZero(toInteger(sumEntries(impactEntries)));

  const imaTotal = nullIfZero(
    toInteger(
      directImaTotal ??
        [imaAccel, imaDecel, imaCod, impacts].reduce<number | null>((sum, value) => {
          if (value == null) return sum;
          return (sum ?? 0) + value;
        }, null),
    ),
  );

  const codEvents = nullIfZero(toInteger(directCodEvents ?? imaCod));
  const playerLoadPerMin =
    directPlayerLoadPerMin ?? (playerLoad != null && durationMinutes != null && durationMinutes > 0 ? playerLoad / durationMinutes : null);

  return {
    imaAccel,
    imaDecel,
    imaCod,
    imaTotal,
    codEvents,
    impacts,
    playerLoadPerMin,
    durationMinutes: durationMinutes != null && durationMinutes > 0 ? Math.round(durationMinutes) : null,
    debug: {
      interestingKeys: extractInterestingMetricKeys(record),
      matched: {
        accel: accelEntries.map((entry) => entry.key),
        decel: decelEntries.map((entry) => entry.key),
        cod: codEntries.map((entry) => entry.key),
        impacts: impactEntries.map((entry) => entry.key),
        playerloadPerMin: directPlayerLoadPerMin != null ? ["player_load_per_minute"] : durationMinutes != null ? ["duration_minutes"] : [],
        imaTotal: directImaTotal != null ? ["ima_total_efforts"] : [],
        codEvents: directCodEvents != null ? ["cod_events"] : [],
      },
      derived: {
        imaTotal: directImaTotal != null ? ("direct" as const) : imaTotal != null ? ("fallback_sum" as const) : ("missing" as const),
        codEvents: directCodEvents != null ? ("direct" as const) : imaCod != null ? ("fallback_from_ima_cod" as const) : ("missing" as const),
        playerloadPerMin:
          directPlayerLoadPerMin != null
            ? ("direct" as const)
            : playerLoad != null && durationMinutes != null && durationMinutes > 0
              ? ("derived_from_playerload_duration" as const)
              : ("missing" as const),
      },
    },
  };
}

export function normalizeCatapultActivityStats(args: { activityId?: string | null; date: string; payload: unknown }): CatapultSessionMetric[] {
  const rows = (() => {
    if (Array.isArray(args.payload)) {
      return args.payload.flatMap((item) => {
        const record = asRecord(item);
        if (!record) return [];
        const nested = firstNonEmptyArray(record, ["stats", "athletes", "data", "results", "items"]);
        return nested.length ? nested : [item];
      });
    }
    const record = asRecord(args.payload);
    if (!record) return [];
    return firstNonEmptyArray(record, ["stats", "athletes", "data", "results", "items"]);
  })();

  const normalized: CatapultSessionMetric[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const flattenedRecord = flattenMetricRecord(record);
    const athleteId = extractAthleteId(record);
    if (!athleteId) continue;
    const activityId = extractActivityId(record) ?? args.activityId ?? null;
    const playerLoad = extractMetric(flattenedRecord, ["total_player_load", "player_load", "playerLoad", "load"]) ?? 0;
    const normalizedIma = normalizeImaMetrics(flattenedRecord, playerLoad);
    const normalizedMetabolic = extractMetabolicMetrics(flattenedRecord);
    const normalizedHr = extractHeartRateMetrics(flattenedRecord);

    normalized.push({
      athleteId,
      date: args.date,
      activityId,
      totalDistance: extractMetric(flattenedRecord, ["total_distance", "distance", "totalDistance"]) ?? 0,
      highSpeedDistance: extractMetric(flattenedRecord, ["hir_dist", "high_speed_distance", "highSpeedDistance", "hsd"]) ?? 0,
      sprintDistance: extractMetric(flattenedRecord, ["velocity_band6_total_distance", "sprint_distance", "sprintDistance"]) ?? 0,
      accelerations:
        toInteger(
          extractMetric(flattenedRecord, [
            "gen2_acceleration_band6plus_average_effort_count",
            "tot_as",
            "acceleration_efforts_gen2",
            "accelerations",
            "accels",
          ]),
        ) ?? 0,
      decelerations:
        toInteger(
          extractMetric(flattenedRecord, [
            "gen2_acceleration_band3plus_average_effort_count",
            "tot_ds",
            "deceleration_efforts_gen2",
            "decelerations",
            "decels",
          ]),
        ) ?? 0,
      playerLoad,
      maxVelocity: extractMetric(flattenedRecord, ["max_vel", "max_velocity", "maxVelocity", "top_speed"]) ?? 0,
      velocityBand5TotalDistance: extractMetric(flattenedRecord, ["velocity_band5_total_distance"]),
      velocityBand6TotalDistance: extractMetric(flattenedRecord, ["velocity_band6_total_distance"]),
      hirDist: extractMetric(flattenedRecord, ["hir_dist"]),
      maxVel: extractMetric(flattenedRecord, ["max_vel"]),
      accelB23TotEffsGen2: toInteger(
        extractMetric(flattenedRecord, [
          "gen2_acceleration_band7plus_total_effort_count",
          "accel_b2_3_tot_effs_gen2",
          "acceleration_band2plus_total_efforts_gen2",
        ]),
      ),
      totAs: toInteger(
        extractMetric(flattenedRecord, [
          "gen2_acceleration_band6plus_average_effort_count",
          "tot_as",
          "acceleration_efforts_gen2",
        ]),
      ),
      decelB23TotEffsGen2: toInteger(
        extractMetric(flattenedRecord, [
          "gen2_acceleration_band2plus_total_effort_count",
          "decel_b2_3_tot_effs_gen2",
          "deceleration_band2plus_total_efforts_gen2",
        ]),
      ),
      totDs: toInteger(
        extractMetric(flattenedRecord, [
          "gen2_acceleration_band3plus_average_effort_count",
          "tot_ds",
          "deceleration_efforts_gen2",
        ]),
      ),
      totalPlayerLoad: extractMetric(flattenedRecord, ["total_player_load"]),
      playerLoadPerMinute: normalizedIma.playerLoadPerMin,
      metabolicPower: normalizedMetabolic.metabolicPower,
      metabolicPowerPeak: normalizedMetabolic.metabolicPowerPeak,
      highMetabolicLoadDistanceM: normalizedMetabolic.highMetabolicLoadDistanceM,
      metabolicEnergyKj: normalizedMetabolic.metabolicEnergyKj,
      timeAboveHmlThresholdS: normalizedMetabolic.timeAboveHmlThresholdS,
      metabolicPowerGen: normalizedMetabolic.metabolicPowerGen,
      metabolicDataValid: normalizedMetabolic.metabolicDataValid,
      explosiveDistance: extractMetric(flattenedRecord, ["explosive_distance", "explosiveDistance"]),
      imaAccel: normalizedIma.imaAccel,
      imaDecel: normalizedIma.imaDecel,
      imaCod: normalizedIma.imaCod,
      imaTotal: normalizedIma.imaTotal,
      codEvents: normalizedIma.codEvents,
      impacts: normalizedIma.impacts,
      imaDebug: normalizedIma.debug,
      // Football Movement Profile (FMP) — inertial sensor, works indoors
      // Exact Catapult display names: "FMP Very Low Duration", "FMP Low Duration",
      // "FMP Running Medium Duration", "FMP Running High Duration",
      // "FMP Dynamic Medium Duration", "FMP Dynamic High Duration"
      // API returns keys as flattened lowercase: "fmpverylowduration", "fmp_very_low_duration", etc.
      fmpVeryLowS: extractMetric(flattenedRecord, [
        "fmpverylowduration", "fmp_very_low_duration",
        "fmpverylowintensityduration", "fmp_very_low_intensity_duration",
      ]),
      fmpLowIntensityS: extractMetric(flattenedRecord, [
        "fmplowduration", "fmp_low_duration",
        "fmplowintensityduration", "fmp_low_intensity_duration",
      ]),
      fmpRunningMediumS: extractMetric(flattenedRecord, [
        "fmprunningmediumduration", "fmp_running_medium_duration",
        "fmprunningmedduration", "fmp_running_med_duration",
        "fmprunningmediumintensityduration", "fmp_running_medium_intensity_duration",
      ]),
      fmpRunningHighS: extractMetric(flattenedRecord, [
        "fmprunninghighduration", "fmp_running_high_duration",
        "fmprunninghighintensityduration", "fmp_running_high_intensity_duration",
      ]),
      fmpDynamicLowS: extractMetric(flattenedRecord, [
        "fmpdynamiclowduration", "fmp_dynamic_low_duration",
        "fmpdynamiclowintensityduration", "fmp_dynamic_low_intensity_duration",
      ]),
      fmpDynamicMediumS: extractMetric(flattenedRecord, [
        "fmpdynamicmediumduration", "fmp_dynamic_medium_duration",
        "fmpdynamicmedduration", "fmp_dynamic_med_duration",
        "fmpdynamicmediumintensityduration", "fmp_dynamic_medium_intensity_duration",
      ]),
      fmpDynamicHighS: extractMetric(flattenedRecord, [
        "fmpdynamichighduration", "fmp_dynamic_high_duration",
        "fmpdynamichighintensityduration", "fmp_dynamic_high_intensity_duration",
      ]),
      fmpTotalDurationS: extractMetric(flattenedRecord, [
        "fmptotalduration", "fmp_total_duration",
        "fmptotaldynamicduration", "fmp_total_dynamic_duration",
        "fmptotalrunningduration", "fmp_total_running_duration",
      ]),
      avgHeartRate: normalizedHr.avgHeartRate,
      maxHeartRate: normalizedHr.maxHeartRate,
      hrZone1TimeS: normalizedHr.hrZone1TimeS,
      hrZone2TimeS: normalizedHr.hrZone2TimeS,
      hrZone3TimeS: normalizedHr.hrZone3TimeS,
      hrZone4TimeS: normalizedHr.hrZone4TimeS,
      hrZone5TimeS: normalizedHr.hrZone5TimeS,
      durationMinutes: normalizedIma.durationMinutes,
    });
  }

  return normalized;
}

function sumNullable(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function maxNullable(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null && b == null) return null;
  return Math.max(a ?? Number.NEGATIVE_INFINITY, b ?? Number.NEGATIVE_INFINITY);
}

export function aggregateCatapultMetrics(metrics: CatapultSessionMetric[]): CatapultSessionMetric[] {
  const byAthleteDate = new Map<string, CatapultSessionMetric>();
  const seenActivityAthlete = new Set<string>();

  for (const metric of metrics) {
    const dedupeKey = `${metric.activityId ?? "unknown"}:${metric.athleteId}:${metric.date}`;
    if (seenActivityAthlete.has(dedupeKey)) continue;
    seenActivityAthlete.add(dedupeKey);

    const key = `${metric.athleteId}:${metric.date}`;
    const current = byAthleteDate.get(key);
    if (!current) {
      byAthleteDate.set(key, { ...metric });
      continue;
    }

    current.totalDistance += metric.totalDistance;
    current.highSpeedDistance += metric.highSpeedDistance;
    current.sprintDistance += metric.sprintDistance;
    current.accelerations += metric.accelerations;
    current.decelerations += metric.decelerations;
    current.playerLoad += metric.playerLoad;
    current.maxVelocity = Math.max(current.maxVelocity, metric.maxVelocity);
    current.velocityBand5TotalDistance = sumNullable(current.velocityBand5TotalDistance, metric.velocityBand5TotalDistance);
    current.velocityBand6TotalDistance = sumNullable(current.velocityBand6TotalDistance, metric.velocityBand6TotalDistance);
    current.hirDist = sumNullable(current.hirDist, metric.hirDist);
    current.maxVel = maxNullable(current.maxVel, metric.maxVel);
    current.accelB23TotEffsGen2 = sumNullable(current.accelB23TotEffsGen2, metric.accelB23TotEffsGen2);
    current.totAs = sumNullable(current.totAs, metric.totAs);
    current.decelB23TotEffsGen2 = sumNullable(current.decelB23TotEffsGen2, metric.decelB23TotEffsGen2);
    current.totDs = sumNullable(current.totDs, metric.totDs);
    current.totalPlayerLoad = sumNullable(current.totalPlayerLoad, metric.totalPlayerLoad);
    current.playerLoadPerMinute = maxNullable(current.playerLoadPerMinute, metric.playerLoadPerMinute);
    current.metabolicPower = sumNullable(current.metabolicPower, metric.metabolicPower);
    current.metabolicPowerPeak = maxNullable(current.metabolicPowerPeak, metric.metabolicPowerPeak);
    current.highMetabolicLoadDistanceM = sumNullable(current.highMetabolicLoadDistanceM, metric.highMetabolicLoadDistanceM);
    current.metabolicEnergyKj = sumNullable(current.metabolicEnergyKj, metric.metabolicEnergyKj);
    current.timeAboveHmlThresholdS = sumNullable(current.timeAboveHmlThresholdS, metric.timeAboveHmlThresholdS);
    // gen: prefer gen2 if any activity reports it
    if (metric.metabolicPowerGen === "gen2") current.metabolicPowerGen = "gen2";
    else if (!current.metabolicPowerGen && metric.metabolicPowerGen) current.metabolicPowerGen = metric.metabolicPowerGen;
    // valid: true if ANY activity has valid metabolic data
    if (metric.metabolicDataValid) current.metabolicDataValid = true;
    current.explosiveDistance = sumNullable(current.explosiveDistance, metric.explosiveDistance);
    current.imaAccel = sumNullable(current.imaAccel, metric.imaAccel);
    current.imaDecel = sumNullable(current.imaDecel, metric.imaDecel);
    current.imaCod = sumNullable(current.imaCod, metric.imaCod);
    current.imaTotal = sumNullable(current.imaTotal, metric.imaTotal);
    current.codEvents = sumNullable(current.codEvents, metric.codEvents);
    current.impacts = sumNullable(current.impacts, metric.impacts);
    if (metric.imaDebug?.interestingKeys?.length) {
      current.imaDebug = metric.imaDebug;
    }
    // FMP: durations sum across sessions
    current.fmpVeryLowS = sumNullable(current.fmpVeryLowS, metric.fmpVeryLowS);
    current.fmpLowIntensityS = sumNullable(current.fmpLowIntensityS, metric.fmpLowIntensityS);
    current.fmpRunningMediumS = sumNullable(current.fmpRunningMediumS, metric.fmpRunningMediumS);
    current.fmpRunningHighS = sumNullable(current.fmpRunningHighS, metric.fmpRunningHighS);
    current.fmpDynamicLowS = sumNullable(current.fmpDynamicLowS, metric.fmpDynamicLowS);
    current.fmpDynamicMediumS = sumNullable(current.fmpDynamicMediumS, metric.fmpDynamicMediumS);
    current.fmpDynamicHighS = sumNullable(current.fmpDynamicHighS, metric.fmpDynamicHighS);
    current.fmpTotalDurationS = sumNullable(current.fmpTotalDurationS, metric.fmpTotalDurationS);
    // Heart Rate: average HR is averaged across activities, max HR takes max, zones sum
    current.avgHeartRate = maxNullable(current.avgHeartRate, metric.avgHeartRate); // use max as proxy when multi-session
    current.maxHeartRate = maxNullable(current.maxHeartRate, metric.maxHeartRate);
    current.hrZone1TimeS = sumNullable(current.hrZone1TimeS, metric.hrZone1TimeS);
    current.hrZone2TimeS = sumNullable(current.hrZone2TimeS, metric.hrZone2TimeS);
    current.hrZone3TimeS = sumNullable(current.hrZone3TimeS, metric.hrZone3TimeS);
    current.hrZone4TimeS = sumNullable(current.hrZone4TimeS, metric.hrZone4TimeS);
    current.hrZone5TimeS = sumNullable(current.hrZone5TimeS, metric.hrZone5TimeS);
    // Session duration: sum across activities
    current.durationMinutes = sumNullable(current.durationMinutes, metric.durationMinutes);
  }

  return Array.from(byAthleteDate.values());
}

export function toNormalizedExternalLoad(metric: CatapultSessionMetric, playerId: string): NormalizedExternalLoad {
  return {
    playerId,
    date: metric.date,
    source: "catapult",
    externalAthleteId: metric.athleteId,
    activityCount: 1,
    externalLoad: {
      totalDistance: metric.totalDistance,
      highSpeedDistance: metric.highSpeedDistance,
      sprintDistance: metric.sprintDistance,
      accelerations: metric.accelerations,
      decelerations: metric.decelerations,
      playerLoad: metric.playerLoad,
      maxVelocity: metric.maxVelocity,
      velocityBand5TotalDistance: metric.velocityBand5TotalDistance ?? null,
      velocityBand6TotalDistance: metric.velocityBand6TotalDistance ?? null,
      hirDist: metric.hirDist ?? null,
      maxVel: metric.maxVel ?? null,
      accelB23TotEffsGen2: metric.accelB23TotEffsGen2 ?? null,
      totAs: metric.totAs ?? null,
      decelB23TotEffsGen2: metric.decelB23TotEffsGen2 ?? null,
      totDs: metric.totDs ?? null,
      totalPlayerLoad: metric.totalPlayerLoad ?? null,
      playerLoadPerMinute: metric.playerLoadPerMinute ?? null,
      metabolicPower: metric.metabolicPower ?? null,
      metabolicPowerPeak: metric.metabolicPowerPeak ?? null,
      highMetabolicLoadDistanceM: metric.highMetabolicLoadDistanceM ?? null,
      metabolicEnergyKj: metric.metabolicEnergyKj ?? null,
      timeAboveHmlThresholdS: metric.timeAboveHmlThresholdS ?? null,
      metabolicPowerGen: metric.metabolicPowerGen ?? null,
      metabolicDataValid: metric.metabolicDataValid ?? false,
      explosiveDistance: metric.explosiveDistance ?? null,
      imaAccel: metric.imaAccel ?? null,
      imaDecel: metric.imaDecel ?? null,
      imaCod: metric.imaCod ?? null,
      imaTotal: metric.imaTotal ?? null,
      codEvents: metric.codEvents ?? null,
      impacts: metric.impacts ?? null,
      avgHeartRate: metric.avgHeartRate ?? null,
      maxHeartRate: metric.maxHeartRate ?? null,
      hrZone1TimeS: metric.hrZone1TimeS ?? null,
      hrZone2TimeS: metric.hrZone2TimeS ?? null,
      hrZone3TimeS: metric.hrZone3TimeS ?? null,
      hrZone4TimeS: metric.hrZone4TimeS ?? null,
      hrZone5TimeS: metric.hrZone5TimeS ?? null,
      // FMP (Football Movement Profile)
      fmpVeryLowS: metric.fmpVeryLowS ?? null,
      fmpLowIntensityS: metric.fmpLowIntensityS ?? null,
      fmpRunningMediumS: metric.fmpRunningMediumS ?? null,
      fmpRunningHighS: metric.fmpRunningHighS ?? null,
      fmpDynamicLowS: metric.fmpDynamicLowS ?? null,
      fmpDynamicMediumS: metric.fmpDynamicMediumS ?? null,
      fmpDynamicHighS: metric.fmpDynamicHighS ?? null,
      fmpTotalDurationS: metric.fmpTotalDurationS ?? null,
      durationMinutes: metric.durationMinutes ?? null,
    },
  };
}

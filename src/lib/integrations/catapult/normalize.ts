import type { CatapultSessionMetric, NormalizedExternalLoad } from "./types";

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
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

const LABEL_KEYS = ["name", "label", "parameter", "parameter_name", "metric", "metric_name", "key", "title"] as const;
const VALUE_KEYS = ["value", "result", "stat", "count", "total", "amount", "metric_value"] as const;

function canonicalKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function flattenMetricRecord(input: Record<string, unknown>, prefix = "", depth = 0, out?: Record<string, unknown>): Record<string, unknown> {
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
      const label = LABEL_KEYS.map((labelKey) => nestedRecord[labelKey]).find((candidate) => typeof candidate === "string" && candidate.trim().length);
      const metricValue = VALUE_KEYS.map((valueKey) => toNumber(nestedRecord[valueKey])).find((candidate) => candidate != null);
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
        const label = LABEL_KEYS.map((labelKey) => itemRecord[labelKey]).find((candidate) => typeof candidate === "string" && candidate.trim().length);
        const metricValue = VALUE_KEYS.map((valueKey) => toNumber(itemRecord[valueKey])).find((candidate) => candidate != null);
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
  for (const key of keys) {
    const value = toNumber(record[key] ?? canonicalMap.get(canonicalKey(key)));
    if (value != null) return value;
  }
  return null;
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

export function extractInterestingMetricKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record)
    .filter((key) => /(ima|accel|decel|cod|impact|playerload|duration)/i.test(key))
    .sort((a, b) => a.localeCompare(b));
}

// ─── Metabolic metrics extraction ──────────────────────────────────────────

const METABOLIC_AVG_POWER_KEYS = [
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
  "metabolic_power_peak",
  "peak_metabolic_power",
  "max_metabolic_power",
  "metabolic_power_w_kg_peak",
  "peak_meta_power",
  "peakMetaPower",
];

const HMLD_KEYS = [
  "high_metabolic_load_distance",
  "hmld",
  "hml_distance",
  "high_metabolic_power_distance",
  "distance_above_25_5_w_kg",
  "highMetabolicLoadDistance",
  "hml_dist",
];

const METABOLIC_ENERGY_KEYS = [
  "metabolic_energy",
  "energy_kj",
  "energy_expenditure_kj",
  "meta_energy",
  "metaEnergy",
];

const TIME_ABOVE_HML_KEYS = [
  "time_above_hml_threshold",
  "hml_time",
  "time_above_25_5_w_kg",
  "high_metabolic_load_time",
  "timeAboveHmlThreshold",
];

const METABOLIC_GEN_KEYS = [
  "metabolic_power_gen",
  "metabolic_power_version",
  "gen2_metabolic_power",
  "metabolic_power_model",
];

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
  const rawAvg = extractMetric(record, METABOLIC_AVG_POWER_KEYS);
  const rawPeak = extractMetric(record, METABOLIC_PEAK_POWER_KEYS);
  const rawHmld = extractMetric(record, HMLD_KEYS);
  const rawEnergy = extractMetric(record, METABOLIC_ENERGY_KEYS);
  const rawTime = extractMetric(record, TIME_ABOVE_HML_KEYS);
  const rawGen = extractStringField(record, METABOLIC_GEN_KEYS);

  const metabolicPower = sanitiseMetabolicValue(rawAvg, 0, 60);
  const metabolicPowerPeak = sanitiseMetabolicValue(rawPeak, 0, 60);
  const highMetabolicLoadDistanceM = sanitiseMetabolicValue(rawHmld, 0, 15_000);
  const metabolicEnergyKj = sanitiseMetabolicValue(rawEnergy, 0, 8_000);
  const timeAboveHmlThresholdS = sanitiseMetabolicValue(rawTime, 0, 7_200);

  // Infer generation from key names found in record or explicit gen field
  let metabolicPowerGen: string | null = rawGen ?? null;
  if (!metabolicPowerGen) {
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

  const directImaTotal = extractMetric(record, ["ima_total_efforts", "ima_total", "ima_efforts_total"]);
  const directCodEvents = extractMetric(record, ["cod_events", "change_of_direction_events", "change_of_direction_count"]);
  const directPlayerLoadPerMin = extractMetric(record, ["player_load_per_minute", "playerload_per_min", "playerloadperminute"]);
  const durationMinutes = extractMetric(record, ["duration_minutes", "durationminutes", "session_duration_minutes"]);

  const imaAccel = toInteger(sumEntries(accelEntries));
  const imaDecel = toInteger(sumEntries(decelEntries));
  const imaCod = toInteger(sumEntries(codEntries));
  const impacts = toInteger(sumEntries(impactEntries));

  const imaTotal = toInteger(
    directImaTotal ??
      [imaAccel, imaDecel, imaCod, impacts].reduce<number | null>((sum, value) => {
        if (value == null) return sum;
        return (sum ?? 0) + value;
      }, null),
  );

  const codEvents = toInteger(directCodEvents ?? imaCod);
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
    },
  };
}

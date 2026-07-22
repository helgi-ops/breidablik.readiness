import type { CatapultSessionMetric, NormalizedExternalLoad, ImaClock } from "./types";
import type { PeriodRow } from "@/lib/micropulse/drillActuals";

/**
 * A max-velocity reading above this (km/h) is a GPS spike, not an athlete. The
 * fastest human ever recorded peaks around 37 km/h over a segment, and football
 * GPS top-speeds credibly top out in the mid-30s; a value beyond this is a lost
 * satellite lock or a bad sample, not a sprint. Gate it at ingestion so a spike
 * never enters a top-speed PB or a per-90 profile. (Observed: Magnús Arnar 59.4,
 * Arnþór 38.1 — both impossible.)
 */
export const MAX_PLAUSIBLE_VELOCITY_KMH = 38;

/** Drop an implausible max-velocity spike (returns null); pass anything sane through. */
export function clampMaxVelocityKmh(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  return n > MAX_PLAUSIBLE_VELOCITY_KMH ? null : n;
}

/**
 * Parse the IMA directional ("clock") grid from a flattened Catapult record.
 *
 * Catapult does NOT return the "IMA N O'Clock High" display-name params for this
 * org (they come back as zeros). The real directional data is in the raw fields
 * `ima_band{1,2,3}_direction{1..12}_count`, where the band is the intensity tier
 * (band1=low, band2=medium, band3=high — the same convention normalize already
 * uses for CoD) and direction 1..12 is the clock position. We deliberately skip
 * the `..._old_direction..` legacy fields. Pure + deterministic.
 * Returns null when no directional fields are present.
 */
const CLOCK_BAND_INTENSITY: Record<string, "low" | "medium" | "high"> = { "1": "low", "2": "medium", "3": "high" };
export function parseImaClock(record: Record<string, unknown>): ImaClock | null {
  if (!record || typeof record !== "object") return null;
  const clock: ImaClock = {};
  let found = false;
  for (const [rawKey, rawVal] of Object.entries(record)) {
    const k = String(rawKey).toLowerCase().replace(/[^a-z0-9]/g, "");
    // imaband{1,2,3}direction{1..12}count — note this won't match the legacy
    // "imaband1olddirection1count" because "direction" must follow the band number.
    const m = k.match(/^imaband([123])direction(\d{1,2})count$/);
    if (!m) continue;
    const dirN = parseInt(m[2], 10);
    if (!(dirN >= 1 && dirN <= 12)) continue;
    const v = Number(rawVal);
    if (!Number.isFinite(v)) continue;
    const dir = String(dirN);
    const intensity = CLOCK_BAND_INTENSITY[m[1]];
    if (!clock[dir]) clock[dir] = { high: null, medium: null, low: null };
    clock[dir][intensity] = (clock[dir][intensity] ?? 0) + v;
    found = true;
  }
  return found ? clock : null;
}

/** Merge two clock grids cell-by-cell (summing), for per-day aggregation. */
export function mergeImaClock(a: ImaClock | null | undefined, b: ImaClock | null | undefined): ImaClock | null {
  if (!a) return b ?? null;
  if (!b) return a ?? null;
  const out: ImaClock = {};
  for (const dir of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const ca = a[dir], cb = b[dir];
    const add = (x: number | null | undefined, y: number | null | undefined) =>
      x == null && y == null ? null : (x ?? 0) + (y ?? 0);
    out[dir] = {
      high: add(ca?.high, cb?.high),
      medium: add(ca?.medium, cb?.medium),
      low: add(ca?.low, cb?.low),
    };
  }
  return out;
}

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
  // gen2-model metabolic power value — the key NAME carries the generation, so
  // it's a power VALUE here (the generation is then inferred from the key name
  // below), not an explicit gen-indicator string field.
  "gen2_metabolic_power",
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
  // Exact Catapult OpenField display-names (confirmed in Reporting_Parameters 25 Apr 2026)
  "Energy",                     // bare "Energy" parameter from Breiðablik Reporting_Parameters
  "Meta Energy (KJ/kg)",        // primary KJ/kg variant
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
  "metabolic_power_model",
];

// ─── Heart Rate metric keys ─────────────────────────────────────────────────

const AVG_HEART_RATE_KEYS = [
  // Catapult OpenField's ACTUAL key (confirmed via the raw-payload capture,
  // 2026-07-22) — this is the one that was missing, which is why avg HR was null
  // while max HR mapped.
  "mean_heart_rate",
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

const MIN_HEART_RATE_KEYS = [
  "min_heart_rate", // Catapult OpenField actual key (raw-payload capture)
  "minimum_heart_rate",
  "heart_rate_min",
  "hr_min",
  "minHeartRate",
];

// %HRmax / %HRavg — the submaximal-HR / HRex signal (Buchheit). Session summary
// percentages of the athlete's HRmax; arriving now under these keys, unmapped.
const PCT_MAX_HEART_RATE_KEYS = [
  "percentage_max_heart_rate", // Catapult OpenField actual key
  "pct_max_heart_rate",
  "percent_max_heart_rate",
];
const PCT_AVG_HEART_RATE_KEYS = [
  "percentage_avg_heart_rate", // Catapult OpenField actual key
  "pct_avg_heart_rate",
  "percent_avg_heart_rate",
];

// Catapult sends EIGHT HR bands (not five) as heart_rate_bandN_total_duration —
// a per-band time-in-zone in SECONDS (Catapult's universal duration unit; stored
// as-is like every other *_duration field). We extend to 8 columns rather than
// collapse 8→5, which would fabricate zone boundaries. Legacy display-name /
// zone aliases kept as fallbacks. See migration 20260722120000.
const HR_ZONE_KEYS: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, string[]> = {
  1: ["heart_rate_band1_total_duration", "Heart Rate Zone 1 Duration", "HR Zone 1 Duration", "HR Zone 1 Time", "heart_rate_zone_1_duration", "hr_zone_1_duration", "hrz_1_duration", "zone1duration", "hr_zone1_s", "heart_rate_z1_duration"],
  2: ["heart_rate_band2_total_duration", "Heart Rate Zone 2 Duration", "HR Zone 2 Duration", "HR Zone 2 Time", "heart_rate_zone_2_duration", "hr_zone_2_duration", "hrz_2_duration", "zone2duration", "hr_zone2_s", "heart_rate_z2_duration"],
  3: ["heart_rate_band3_total_duration", "Heart Rate Zone 3 Duration", "HR Zone 3 Duration", "HR Zone 3 Time", "heart_rate_zone_3_duration", "hr_zone_3_duration", "hrz_3_duration", "zone3duration", "hr_zone3_s", "heart_rate_z3_duration"],
  4: ["heart_rate_band4_total_duration", "Heart Rate Zone 4 Duration", "HR Zone 4 Duration", "HR Zone 4 Time", "heart_rate_zone_4_duration", "hr_zone_4_duration", "hrz_4_duration", "zone4duration", "hr_zone4_s", "heart_rate_z4_duration"],
  5: ["heart_rate_band5_total_duration", "Heart Rate Zone 5 Duration", "HR Zone 5 Duration", "HR Zone 5 Time", "heart_rate_zone_5_duration", "hr_zone_5_duration", "hrz_5_duration", "zone5duration", "hr_zone5_s", "heart_rate_z5_duration"],
  6: ["heart_rate_band6_total_duration", "Heart Rate Zone 6 Duration", "HR Zone 6 Duration"],
  7: ["heart_rate_band7_total_duration", "Heart Rate Zone 7 Duration", "HR Zone 7 Duration"],
  8: ["heart_rate_band8_total_duration", "Heart Rate Zone 8 Duration", "HR Zone 8 Duration"],
};

// Per-band average bpm — LABEL only. Source key:
// heart_rate_bandN_average_beats_per_minute.
// CAVEAT (verified on the 22 Jul payload via the HR value-capture): this field is
// UNRELIABLE on low bands — e.g. a player with 64 min in band 1 (mean HR 79) had a
// band-1 "avg bpm" of 0.28, while a genuine band-5 value read 173. The 25–230 clamp
// below therefore nulls the garbage and keeps only plausible HRs, so bands read as a
// bpm only where it's real; the UI labels by ordinal + %, not by this field. Do NOT
// trust it as the band's HR boundary.
const HR_ZONE_AVG_BPM_KEYS: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, string[]> = {
  1: ["heart_rate_band1_average_beats_per_minute"],
  2: ["heart_rate_band2_average_beats_per_minute"],
  3: ["heart_rate_band3_average_beats_per_minute"],
  4: ["heart_rate_band4_average_beats_per_minute"],
  5: ["heart_rate_band5_average_beats_per_minute"],
  6: ["heart_rate_band6_average_beats_per_minute"],
  7: ["heart_rate_band7_average_beats_per_minute"],
  8: ["heart_rate_band8_average_beats_per_minute"],
};

export function extractHeartRateMetrics(record: Record<string, unknown>): {
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  minHeartRate: number | null;
  hrZone1TimeS: number | null;
  hrZone2TimeS: number | null;
  hrZone3TimeS: number | null;
  hrZone4TimeS: number | null;
  hrZone5TimeS: number | null;
  hrZone6TimeS: number | null;
  hrZone7TimeS: number | null;
  hrZone8TimeS: number | null;
  hrZone1AvgBpm: number | null;
  hrZone2AvgBpm: number | null;
  hrZone3AvgBpm: number | null;
  hrZone4AvgBpm: number | null;
  hrZone5AvgBpm: number | null;
  hrZone6AvgBpm: number | null;
  hrZone7AvgBpm: number | null;
  hrZone8AvgBpm: number | null;
  pctMaxHeartRate: number | null;
  pctAvgHeartRate: number | null;
} {
  const avgHeartRate = nullIfZero(sanitiseMetabolicValue(extractMetric(record, AVG_HEART_RATE_KEYS), 30, 220));
  const maxHeartRate = nullIfZero(sanitiseMetabolicValue(extractMetric(record, MAX_HEART_RATE_KEYS), 30, 230));
  const minHeartRate = nullIfZero(sanitiseMetabolicValue(extractMetric(record, MIN_HEART_RATE_KEYS), 25, 220));
  // Zone durations are Catapult SECONDS, stored as-is (0–14 400 s = 4 h ceiling).
  const zone = (band: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) =>
    nullIfZero(sanitiseMetabolicValue(extractMetric(record, HR_ZONE_KEYS[band]), 0, 14_400));
  // Per-band average bpm — label only, plausible HR range 25–230.
  const bandBpm = (band: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) =>
    nullIfZero(sanitiseMetabolicValue(extractMetric(record, HR_ZONE_AVG_BPM_KEYS[band]), 25, 230));
  // %HRmax / %HRavg — session summary percentages of the athlete's HRmax. Allow a
  // little over 100 for HRmax under-estimation; reject the rest as corrupt.
  const pctMaxHeartRate = nullIfZero(sanitiseMetabolicValue(extractMetric(record, PCT_MAX_HEART_RATE_KEYS), 0, 120));
  const pctAvgHeartRate = nullIfZero(sanitiseMetabolicValue(extractMetric(record, PCT_AVG_HEART_RATE_KEYS), 0, 120));
  return {
    avgHeartRate,
    maxHeartRate,
    minHeartRate,
    hrZone1TimeS: zone(1),
    hrZone2TimeS: zone(2),
    hrZone3TimeS: zone(3),
    hrZone4TimeS: zone(4),
    hrZone5TimeS: zone(5),
    hrZone6TimeS: zone(6),
    hrZone7TimeS: zone(7),
    hrZone8TimeS: zone(8),
    hrZone1AvgBpm: bandBpm(1),
    hrZone2AvgBpm: bandBpm(2),
    hrZone3AvgBpm: bandBpm(3),
    hrZone4AvgBpm: bandBpm(4),
    hrZone5AvgBpm: bandBpm(5),
    hrZone6AvgBpm: bandBpm(6),
    hrZone7AvgBpm: bandBpm(7),
    hrZone8AvgBpm: bandBpm(8),
    pctMaxHeartRate,
    pctAvgHeartRate,
  };
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

  // L/R splits — Catapult exports both:
  //   - "IMA CoD Left/Right High/Medium/Low" (derived params, often 0 unless
  //     thresholds are configured in OpenField)
  //   - ima_band1/2/3_left_count, ima_band1/2/3_right_count (raw IMU
  //     direction-event counts, always populated)
  // We match BOTH so we have the raw counts as fallback when the derived
  // parameters return 0. If both match the same data, the sum still works
  // (zeros don't add anything). For Bishop 2020 asymmetry index.
  const codLeftEntries = preferCountLike(
    findMatchingEntries(
      record,
      (entry) => {
        const c = entry.canonical;
        // Explicit "IMA CoD Left X" derived parameter
        if (c.includes("ima") && c.includes("cod") && c.includes("left")) return true;
        // Raw direction-event counts: ima_band{1,2,3}_left_count
        if (/^imaband[1-3]leftcount$/.test(c)) return true;
        return false;
      },
    ),
  );
  const codRightEntries = preferCountLike(
    findMatchingEntries(
      record,
      (entry) => {
        const c = entry.canonical;
        if (c.includes("ima") && c.includes("cod") && c.includes("right")) return true;
        if (/^imaband[1-3]rightcount$/.test(c)) return true;
        return false;
      },
    ),
  );

  // Impacts — the real per-band counts are `imaimpacts_band{1-8}_count`
  // (canonical "imaimpactsband{n}count"). We match those EXACTLY so we don't
  // also sum the per-band averages (`..._average_count[_session]`) or the
  // unrelated goalkeeper dive-load impact fields (`diveload*_impact_dive_load`).
  // The display-name "IMA Impacts Band N Count" shares the same canonical but
  // always reports 0 here (like the IMA clock display names), so it's harmless.
  const impactEntries = preferCountLike(
    findMatchingEntries(record, (entry) => /^imaimpactsband[1-8]count$/.test(entry.canonical)),
  );

  // Jumps — per-band IMA jump counts `ima_band{1-8}_jump_count` (Niklas /
  // Catapult Driver-layer signal). We sum the bands and deliberately EXCLUDE
  // `total_jumps`, which is already the band sum — matching both would double
  // the count.
  const jumpEntries = preferCountLike(
    findMatchingEntries(record, (entry) => /^imaband[1-8]jumpcount$/.test(entry.canonical)),
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
  const imaCodLeft = nullIfZero(toInteger(sumEntries(codLeftEntries)));
  const imaCodRight = nullIfZero(toInteger(sumEntries(codRightEntries)));
  const impacts = nullIfZero(toInteger(sumEntries(impactEntries)));
  const jumps = nullIfZero(toInteger(sumEntries(jumpEntries)));

  // Per-intensity CoD splits (Bishop 2020 needs intensity-tier asymmetry).
  // Catapult exposes these as "IMA CoD Left High/Medium/Low" — canonical
  // form drops spaces so we look for substrings in the canonical key. The
  // raw imaband{1,2,3} numeric form maps band1→low, band2→medium, band3→high.
  const sumByLevel = (
    entries: ReturnType<typeof preferCountLike>,
    level: "low" | "medium" | "high",
    bandDigit: "1" | "2" | "3",
  ) =>
    nullIfZero(
      toInteger(
        sumEntries(
          entries.filter((e) => {
            const c = e.canonical;
            return c.includes(level) || c.includes(`band${bandDigit}`);
          }),
        ),
      ),
    );

  // Catapult intensity → numeric band: low=1, medium=2, high=3.
  const imaCodLeftHigh   = sumByLevel(codLeftEntries,  "high",   "3");
  const imaCodLeftMedium = sumByLevel(codLeftEntries,  "medium", "2");
  const imaCodLeftLow    = sumByLevel(codLeftEntries,  "low",    "1");
  const imaCodRightHigh   = sumByLevel(codRightEntries, "high",   "3");
  const imaCodRightMedium = sumByLevel(codRightEntries, "medium", "2");
  const imaCodRightLow    = sumByLevel(codRightEntries, "low",    "1");

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
    imaCodLeft,
    imaCodRight,
    imaCodLeftHigh,
    imaCodLeftMedium,
    imaCodLeftLow,
    imaCodRightHigh,
    imaCodRightMedium,
    imaCodRightLow,
    imaTotal,
    codEvents,
    impacts,
    jumps,
    playerLoadPerMin,
    durationMinutes: durationMinutes != null && durationMinutes > 0 ? Math.round(durationMinutes) : null,
    debug: {
      interestingKeys: extractInterestingMetricKeys(record),
      matched: {
        accel: accelEntries.map((entry) => entry.key),
        decel: decelEntries.map((entry) => entry.key),
        cod: codEntries.map((entry) => entry.key),
        codLeft: codLeftEntries.map((entry) => entry.key),
        codRight: codRightEntries.map((entry) => entry.key),
        impacts: impactEntries.map((entry) => entry.key),
        jumps: jumpEntries.map((entry) => entry.key),
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

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

/**
 * Per-PERIOD athlete stats → PeriodRow[]. Used by the API sync path when a
 * session is queried with group_by ["athlete","period"] so each period (drill)
 * can be matched to a built drill. Best-effort and defensive: if the org's
 * stats don't carry period rows / names this returns [] and the caller writes
 * no actuals. Only the reliably-named core metrics (player load, distance, HSR,
 * sprint) are extracted from the API rows; accel/decel/duration are left to the
 * CSV path until the API field names are confirmed against a live org response.
 * NEEDS LIVE VERIFICATION against the Catapult stats response shape.
 */
export function normalizeCatapultPeriodStats(args: { payload: unknown }): PeriodRow[] {
  const rows = (() => {
    if (Array.isArray(args.payload)) {
      return args.payload.flatMap((item) => {
        const record = asRecord(item);
        if (!record) return [];
        const nested = firstNonEmptyArray(record, ["stats", "athletes", "periods", "data", "results", "items"]);
        return nested.length ? nested : [item];
      });
    }
    const record = asRecord(args.payload);
    if (!record) return [];
    return firstNonEmptyArray(record, ["stats", "athletes", "periods", "data", "results", "items"]);
  })();

  const orderByName = new Map<string, number>();
  let nextOrder = 0;
  const out: PeriodRow[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const athleteId = extractAthleteId(record);
    if (!athleteId) continue;
    const periodName = firstString(record, ["period_name", "periodName", "period", "name", "tag", "title"]);
    if (!periodName || /^(session|total|whole session)$/i.test(periodName)) continue;
    const f = flattenMetricRecord(record);
    const norm = periodName.toLowerCase();
    if (!orderByName.has(norm)) orderByName.set(norm, nextOrder++);
    // Duration from the period's start/end epoch seconds (reliable per period).
    const startT = Number(record.start_time);
    const endT = Number(record.end_time);
    const durationMin = Number.isFinite(startT) && Number.isFinite(endT) && endT > startT
      ? Math.round(((endT - startT) / 60) * 10) / 10
      : null;
    const sum2 = (a: number | null, b: number | null) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
    const nz = (v: number | null | undefined) => (v == null || v === 0 ? null : v); // treat 0 as "not captured" for IMA/metabolic
    const playerLoad = extractMetric(f, ["total_player_load", "player_load", "playerLoad", "load"]);
    // HIR / high-speed running. This org doesn't compute hir_dist (0 everywhere),
    // and the derived high_speed_distance column isn't a per-period field — but
    // the daily pipeline defines HSR = velocity band5 + band6, so derive HIR the
    // same way per drill (fall back only when a direct HIR field is truly present).
    const velB5 = extractMetric(f, ["velocity_band5_total_distance"]);
    const velB6 = extractMetric(f, ["velocity_band6_total_distance", "sprint_distance"]);
    const hirDirect = extractMetric(f, ["hir_dist", "high_speed_distance", "highSpeedDistance", "hsd"]);
    // Reuse the daily normalizer's IMA + metabolic extraction so the per-drill
    // set matches the athlete-daily set (Pro/Vector Pro only — 0/absent on Core).
    const ima = normalizeImaMetrics(f, playerLoad);
    const met = extractMetabolicMetrics(f);
    out.push({
      periodName,
      order: orderByName.get(norm)!,
      athleteKey: athleteId,
      metrics: {
        player_load: playerLoad,
        player_load_per_min: extractMetric(f, ["player_load_per_minute", "player_load_per_min"]) ?? ima.playerLoadPerMin ?? null,
        distance_m: extractMetric(f, ["total_distance", "distance", "totalDistance"]),
        hir_total: hirDirect != null && hirDirect > 0 ? hirDirect : sum2(velB5, velB6),
        vel_b5: velB5,
        vel_b6: velB6,
        max_velocity: clampMaxVelocityKmh(extractMetric(f, ["max_vel", "max_velocity", "maxVelocity", "top_speed"])),
        // Catapult's gen2 scheme encodes BOTH accel and decel efforts under the
        // gen2_acceleration_band* family — there is NO gen2_deceleration_band*
        // field. Mirror the daily normalizer EXACTLY (accel B2-3 = band7plus,
        // decel B2-3 = band2plus) so a drill's Accel/Decel B2-3 means the same as
        // every squad surface. Both keys are returned per-period.
        accel_b23: extractMetric(f, ["gen2_acceleration_band7plus_total_effort_count", "accel_b2_3_tot_effs_gen2", "acceleration_band2plus_total_efforts_gen2"]),
        decel_b23: extractMetric(f, ["gen2_acceleration_band2plus_total_effort_count", "decel_b2_3_tot_effs_gen2", "deceleration_band2plus_total_efforts_gen2"]),
        // Match the daily normalizer's key lists (gen2 avg-effort keys first) so
        // per-drill totals fill the same way the athlete-daily totals do.
        accel_total: extractMetric(f, ["gen2_acceleration_band6plus_average_effort_count", "tot_as", "acceleration_efforts_gen2", "total_accelerations", "accelerations"]),
        decel_total: extractMetric(f, ["gen2_acceleration_band3plus_average_effort_count", "tot_ds", "deceleration_efforts_gen2", "total_decelerations", "decelerations"]),
        hmld_m: met.highMetabolicLoadDistanceM,
        metabolic_power_avg: met.metabolicPower,
        metabolic_power_peak: met.metabolicPowerPeak,
        duration_min: durationMin,
        ima_accel: nz(ima.imaAccel),
        ima_decel: nz(ima.imaDecel),
        // Aggregate imaCod is null for this org (matches the daily path) — the real
        // change-of-direction data lives in the L/R band counts, so total CoD =
        // left + right directional events.
        ima_cod_total: nz(ima.imaCod ?? sum2(ima.imaCodLeft ?? null, ima.imaCodRight ?? null)),
        high_ima: nz(sum2(ima.imaCodLeftHigh ?? null, ima.imaCodRightHigh ?? null)),
        jumps: nz(ima.jumps),
      },
    });
  }
  return out;
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
      // DIAGNOSTIC: keep the source param object + the flattened key names the
      // mapper matches against, so we can see what OpenField actually sends
      // (e.g. the real name for avg HR / HR zones). Not read by any feature.
      rawParams: record,
      paramKeys: Object.keys(flattenedRecord),
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
      maxVelocity: clampMaxVelocityKmh(extractMetric(flattenedRecord, ["max_vel", "max_velocity", "maxVelocity", "top_speed"])) ?? 0,
      velocityBand5TotalDistance: extractMetric(flattenedRecord, ["velocity_band5_total_distance"]),
      velocityBand6TotalDistance: extractMetric(flattenedRecord, ["velocity_band6_total_distance"]),
      velocityBand4TotalEffortsGen2: toInteger(
        extractMetric(flattenedRecord, [
          "velocity_band_4_plus_total_effort_count_set_2",
          "velocity_band4_total_effort_count_gen2",
          "velocityBand4TotalEffortsGen2",
        ]),
      ),
      velocityBand5TotalEffortsGen2: toInteger(
        extractMetric(flattenedRecord, [
          // PRIMARY — exact OpenField parameter name (HS = High Speed Efforts)
          "HS Efforts",
          "hs_efforts",
          "high_speed_efforts",
          // Legacy fallbacks
          "velocity_band_5_plus_total_effort_count_set_2",
          "velocity_band5_total_effort_count_gen2",
          "velocity_band5_plus_total_efforts_gen2",
          "vb5_plus_total_efforts_gen2",
          "velocityBand5TotalEffortsGen2",
        ]),
      ),
      velocityBand6TotalEffortsGen2: toInteger(
        extractMetric(flattenedRecord, [
          // PRIMARY — exact OpenField parameter name confirmed in Reporting_Parameters
          "Sprint Efforts",
          "sprint_efforts",
          "sprintEfforts",
          // Legacy fallbacks
          "velocity_band_6_plus_total_effort_count_set_2",
          "velocity_band6_total_effort_count_gen2",
          "velocity_band6_plus_total_efforts_gen2",
          "vb6_plus_total_efforts_gen2",
          "velocityBand6TotalEffortsGen2",
        ]),
      ),
      hirDist: extractMetric(flattenedRecord, ["hir_dist"]),
      maxVel: clampMaxVelocityKmh(extractMetric(flattenedRecord, ["max_vel"])),
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
      // McBurnie 2022 — IMA-based per-band decel counts. Catapult exposes
      // these in the base activity-stats payload under exact keys
      // ima_band1_decel_count / ima_band2_decel_count / ima_band3_decel_count.
      // Band 3 (>3 m/s²) is the McBurnie-preferred high-intensity input.
      // Verified via debug-fields probe (28 Apr 2026): for Jónatan's 22 Apr
      // session the values were 88 / 24 / 13 respectively — consistent with
      // expected band distribution (more low-intensity, fewer high-intensity).
      imaBand1DecelCount: toInteger(
        extractMetric(flattenedRecord, [
          "ima_band1_decel_count",
          "ima_band_1_decel_count",
        ]),
      ),
      imaBand2DecelCount: toInteger(
        extractMetric(flattenedRecord, [
          "ima_band2_decel_count",
          "ima_band_2_decel_count",
        ]),
      ),
      imaBand3DecelCount: toInteger(
        extractMetric(flattenedRecord, [
          "ima_band3_decel_count",
          "ima_band_3_decel_count",
        ]),
      ),
      // Symmetric IMA accel counts. Required so McBurnie A:D coupling can
      // pair Band 3 vs Band 3 instead of Band 3 vs combined-intensity Accel
      // B2-3 (which produces artificially low ratios that flag spurious red).
      imaBand1AccelCount: toInteger(
        extractMetric(flattenedRecord, [
          "ima_band1_accel_count",
          "ima_band_1_accel_count",
        ]),
      ),
      imaBand2AccelCount: toInteger(
        extractMetric(flattenedRecord, [
          "ima_band2_accel_count",
          "ima_band_2_accel_count",
        ]),
      ),
      imaBand3AccelCount: toInteger(
        extractMetric(flattenedRecord, [
          "ima_band3_accel_count",
          "ima_band_3_accel_count",
        ]),
      ),
      // GPS Gen-2 high-intensity-only decel count (band 3, >3 m/s²).
      // Once OpenField has "Deceleration B3 Efforts (Gen 2)" enabled AND
      // Catapult API V6 actually returns it (which it didn't on 28 Apr —
      // see debug probe), this becomes a fallback after IMA band 3.
      //
      // Catapult uses "B3" (no "+" suffix) for decels because band 3 is the
      // highest bucket — there is no decel B4. Both alias forms (band3 and
      // band3plus) are listed in case different OpenField versions flatten
      // display names differently.
      decelB3PlusTotEffsGen2: toInteger(
        extractMetric(flattenedRecord, [
          // Most likely flattened forms of "Deceleration B3 Efforts (Gen 2)"
          "gen2_deceleration_band3_total_effort_count",
          "deceleration_band3_total_efforts_gen2",
          "deceleration_b3_efforts_gen2",
          "decel_b3_efforts_gen2",
          "decel_band3_efforts_gen2",
          // Plus-suffix variants (legacy / cross-version compatibility)
          "gen2_deceleration_band3plus_total_effort_count",
          "decel_b3_plus_tot_effs_gen2",
          "decel_b3plus_tot_effs_gen2",
          "deceleration_band3plus_total_efforts_gen2",
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
      imaCodLeft: normalizedIma.imaCodLeft,
      imaCodRight: normalizedIma.imaCodRight,
      imaCodLeftHigh: normalizedIma.imaCodLeftHigh,
      imaCodLeftMedium: normalizedIma.imaCodLeftMedium,
      imaCodLeftLow: normalizedIma.imaCodLeftLow,
      imaCodRightHigh: normalizedIma.imaCodRightHigh,
      imaCodRightMedium: normalizedIma.imaCodRightMedium,
      imaCodRightLow: normalizedIma.imaCodRightLow,
      imaClock: parseImaClock(flattenedRecord),
      imaTotal: normalizedIma.imaTotal,
      codEvents: normalizedIma.codEvents,
      impacts: normalizedIma.impacts,
      jumps: normalizedIma.jumps,
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
      minHeartRate: normalizedHr.minHeartRate,
      hrZone1TimeS: normalizedHr.hrZone1TimeS,
      hrZone2TimeS: normalizedHr.hrZone2TimeS,
      hrZone3TimeS: normalizedHr.hrZone3TimeS,
      hrZone4TimeS: normalizedHr.hrZone4TimeS,
      hrZone5TimeS: normalizedHr.hrZone5TimeS,
      hrZone6TimeS: normalizedHr.hrZone6TimeS,
      hrZone7TimeS: normalizedHr.hrZone7TimeS,
      hrZone8TimeS: normalizedHr.hrZone8TimeS,
      hrZone1AvgBpm: normalizedHr.hrZone1AvgBpm,
      hrZone2AvgBpm: normalizedHr.hrZone2AvgBpm,
      hrZone3AvgBpm: normalizedHr.hrZone3AvgBpm,
      hrZone4AvgBpm: normalizedHr.hrZone4AvgBpm,
      hrZone5AvgBpm: normalizedHr.hrZone5AvgBpm,
      hrZone6AvgBpm: normalizedHr.hrZone6AvgBpm,
      hrZone7AvgBpm: normalizedHr.hrZone7AvgBpm,
      hrZone8AvgBpm: normalizedHr.hrZone8AvgBpm,
      pctMaxHeartRate: normalizedHr.pctMaxHeartRate,
      pctAvgHeartRate: normalizedHr.pctAvgHeartRate,
      durationMinutes: normalizedIma.durationMinutes,
      // IMA Free Running 8-band pipeline (indoor stride detail)
      ...extractFreeRunningBands(flattenedRecord),
    });
  }

  return normalized;
}

/** Extract IMA Free Running stride/cadence/load values for all 8 bands.
 *
 * Verified by Catapult debug-fields probe (28 Apr 2026): the actual response
 * keys use the snake_case patterns below. The original "ima_free_running_*"
 * and "ima_fr_*" alias attempts NEVER matched because Catapult uses:
 *   - "imafreerunning_band{N}_*" — NO underscore between "ima" and "freerunning"
 *   - "ima_v2_free_run_band{N}_*" — V2 modern keys for stride count, rate, etc.
 *
 * Display-name aliases ("IMA Free Running Band 1 Stride Count") kept as
 * last-ditch fallback for orgs whose API returns the human-readable form.
 */
function extractFreeRunningBands(flat: Record<string, unknown>): Record<string, number | null> {
  // Helper: try aliases in order, return first non-zero non-null. Falls back
  // to first non-null if all values are 0. This is critical because V2 Free
  // Running requires sustained continuous running periods, which return 0 in
  // start/stop sports like football. V1 counts individual stride events and
  // is usually non-zero. We want the first NON-ZERO value, not just the first
  // value that happens to be present.
  function firstNonZero(aliases: string[]): number | null {
    let firstSeen: number | null = null;
    for (const alias of aliases) {
      const v = extractMetric(flat, [alias]);
      if (v != null && firstSeen == null) firstSeen = v;
      if (v != null && v !== 0) return v;
    }
    return firstSeen;
  }

  const out: Record<string, number | null> = {};
  for (let band = 1; band <= 8; band++) {
    // Stride count — try V2 first, fall through to V1 if V2 is 0.
    const strideAliases = [
      `ima_v2_free_run_band${band}_total_strides`,
      `ima_v2_free_run_band${band}_event_count`,
      `ima_v1_free_run_band${band}_event_count`,
      `imafreerunning_band${band}_event_count`,
      // Legacy / display-name fallbacks
      `IMA Free Running Band ${band} Stride Count`,
      `ima_free_running_band${band}_stride_count`,
      `imafreerunningband${band}stridecount`,
      `ima_fr_band${band}_stride_count`,
    ];
    // Stride rate — V2 average_stride_rate
    const rateAliases = [
      `ima_v2_free_run_band${band}_average_stride_rate`,
      `ima_v1_free_run_band${band}_average_stride_rate`,
      `imafreerunning_band${band}_average_stride_rate`,
      // Legacy / display-name fallbacks
      `IMA Free Running Band ${band} Average Stride Rate`,
      `ima_free_running_band${band}_average_stride_rate`,
      `ima_free_running_band${band}_avg_stride_rate`,
      `imafreerunningband${band}averagestriderate`,
      `ima_fr_band${band}_avg_stride_rate`,
    ];
    // Player load — total player load per band
    const loadAliases = [
      `imafreerunning_band${band}_total_player_load`,
      // Legacy / display-name fallbacks
      `IMA Free Running Band ${band} Total Player Load`,
      `ima_free_running_band${band}_total_player_load`,
      `imafreerunningband${band}totalplayerload`,
      `ima_fr_band${band}_total_player_load`,
    ];
    out[`imaFrBand${band}StrideCount`] = toInteger(firstNonZero(strideAliases));
    out[`imaFrBand${band}AvgStrideRate`] = firstNonZero(rateAliases);
    out[`imaFrBand${band}TotalPlayerLoad`] = firstNonZero(loadAliases);

    // Per-band DISTANCE — metres run inside this cadence band. Only bands 5–8 have
    // storage (the high-cadence / sprint-stride end), so only those are emitted.
    if (band >= 5) {
      const distAliases = [
        `ima_v2_free_run_band${band}_total_distance`,
        `ima_v1_free_run_band${band}_total_distance`,
        `imafreerunning_band${band}_total_distance`,
        // Legacy / display-name fallbacks
        `IMA Free Running Band ${band} Total Distance`,
        `ima_free_running_band${band}_total_distance`,
        `imafreerunningband${band}totaldistance`,
        `ima_fr_band${band}_total_distance`,
      ];
      out[`imaFrBand${band}TotalDistance`] = firstNonZero(distAliases);
    }
  }
  return out;
}

function sumNullable(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function maxNullable(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null && b == null) return null;
  return Math.max(a ?? Number.NEGATIVE_INFINITY, b ?? Number.NEGATIVE_INFINITY);
}

function minNullable(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null && b == null) return null;
  return Math.min(a ?? Number.POSITIVE_INFINITY, b ?? Number.POSITIVE_INFINITY);
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
    current.velocityBand4TotalEffortsGen2 = sumNullable(current.velocityBand4TotalEffortsGen2, metric.velocityBand4TotalEffortsGen2);
    current.velocityBand5TotalEffortsGen2 = sumNullable(current.velocityBand5TotalEffortsGen2, metric.velocityBand5TotalEffortsGen2);
    current.velocityBand6TotalEffortsGen2 = sumNullable(current.velocityBand6TotalEffortsGen2, metric.velocityBand6TotalEffortsGen2);
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
    current.imaCodLeft = sumNullable(current.imaCodLeft, metric.imaCodLeft);
    current.imaCodRight = sumNullable(current.imaCodRight, metric.imaCodRight);
    current.imaCodLeftHigh = sumNullable(current.imaCodLeftHigh, metric.imaCodLeftHigh);
    current.imaCodLeftMedium = sumNullable(current.imaCodLeftMedium, metric.imaCodLeftMedium);
    current.imaCodLeftLow = sumNullable(current.imaCodLeftLow, metric.imaCodLeftLow);
    current.imaCodRightHigh = sumNullable(current.imaCodRightHigh, metric.imaCodRightHigh);
    current.imaCodRightMedium = sumNullable(current.imaCodRightMedium, metric.imaCodRightMedium);
    current.imaCodRightLow = sumNullable(current.imaCodRightLow, metric.imaCodRightLow);
    current.imaTotal = sumNullable(current.imaTotal, metric.imaTotal);
    current.codEvents = sumNullable(current.codEvents, metric.codEvents);
    current.impacts = sumNullable(current.impacts, metric.impacts);
    current.jumps = sumNullable(current.jumps, metric.jumps);
    if (metric.imaDebug?.interestingKeys?.length) {
      current.imaDebug = metric.imaDebug;
    }
    // DIAGNOSTIC: union the parameter names seen across the day's activities, and
    // keep the richest single activity's raw params as the sample (HR may live in
    // only one activity of the day).
    if ((metric.paramKeys?.length ?? 0) > (current.paramKeys?.length ?? 0) && metric.rawParams) {
      current.rawParams = metric.rawParams;
    }
    if (metric.paramKeys?.length) {
      current.paramKeys = [...new Set([...(current.paramKeys ?? []), ...metric.paramKeys])];
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
    current.minHeartRate = minNullable(current.minHeartRate, metric.minHeartRate);
    current.hrZone1TimeS = sumNullable(current.hrZone1TimeS, metric.hrZone1TimeS);
    current.hrZone2TimeS = sumNullable(current.hrZone2TimeS, metric.hrZone2TimeS);
    current.hrZone3TimeS = sumNullable(current.hrZone3TimeS, metric.hrZone3TimeS);
    current.hrZone4TimeS = sumNullable(current.hrZone4TimeS, metric.hrZone4TimeS);
    current.hrZone5TimeS = sumNullable(current.hrZone5TimeS, metric.hrZone5TimeS);
    current.hrZone6TimeS = sumNullable(current.hrZone6TimeS, metric.hrZone6TimeS);
    current.hrZone7TimeS = sumNullable(current.hrZone7TimeS, metric.hrZone7TimeS);
    current.hrZone8TimeS = sumNullable(current.hrZone8TimeS, metric.hrZone8TimeS);
    // Per-band avg bpm is a label (a rate), roughly constant per athlete — take
    // the max across activities as the representative value, like avg HR above.
    current.hrZone1AvgBpm = maxNullable(current.hrZone1AvgBpm, metric.hrZone1AvgBpm);
    current.hrZone2AvgBpm = maxNullable(current.hrZone2AvgBpm, metric.hrZone2AvgBpm);
    current.hrZone3AvgBpm = maxNullable(current.hrZone3AvgBpm, metric.hrZone3AvgBpm);
    current.hrZone4AvgBpm = maxNullable(current.hrZone4AvgBpm, metric.hrZone4AvgBpm);
    current.hrZone5AvgBpm = maxNullable(current.hrZone5AvgBpm, metric.hrZone5AvgBpm);
    current.hrZone6AvgBpm = maxNullable(current.hrZone6AvgBpm, metric.hrZone6AvgBpm);
    current.hrZone7AvgBpm = maxNullable(current.hrZone7AvgBpm, metric.hrZone7AvgBpm);
    current.hrZone8AvgBpm = maxNullable(current.hrZone8AvgBpm, metric.hrZone8AvgBpm);
    // %HRmax/%HRavg are session summaries; take max as the multi-session proxy
    // (same convention as avg HR above).
    current.pctMaxHeartRate = maxNullable(current.pctMaxHeartRate, metric.pctMaxHeartRate);
    current.pctAvgHeartRate = maxNullable(current.pctAvgHeartRate, metric.pctAvgHeartRate);
    // Session duration: sum across activities
    current.durationMinutes = sumNullable(current.durationMinutes, metric.durationMinutes);
    // IMA Free Running 8 bands: stride counts + load sum, stride rate takes max
    for (let band = 1; band <= 8; band++) {
      const sk = `imaFrBand${band}StrideCount` as const;
      const rk = `imaFrBand${band}AvgStrideRate` as const;
      const lk = `imaFrBand${band}TotalPlayerLoad` as const;
      // @ts-expect-error dynamic key access on typed metric object
      current[sk] = sumNullable(current[sk], metric[sk]);
      // @ts-expect-error dynamic key access — stride rate is per-band cadence, take max across activities
      current[rk] = maxNullable(current[rk], metric[rk]);
      // @ts-expect-error dynamic key access
      current[lk] = sumNullable(current[lk], metric[lk]);

      // Distance is a VOLUME — metres run in that band — so it sums across the
      // day's activities, exactly like stride count. (Stride RATE is a cadence and
      // takes the max instead; summing it would be meaningless.)
      if (band >= 5) {
        const dk = `imaFrBand${band}TotalDistance` as const;
        // @ts-expect-error dynamic key access
        current[dk] = sumNullable(current[dk], metric[dk]);
      }
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
    // DIAGNOSTIC — carried to sync.ts for raw_payload_json + the HR-key log.
    rawPayload: metric.rawParams ?? null,
    paramKeys: metric.paramKeys ?? null,
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
      velocityBand4TotalEffortsGen2: metric.velocityBand4TotalEffortsGen2 ?? null,
      velocityBand5TotalEffortsGen2: metric.velocityBand5TotalEffortsGen2 ?? null,
      velocityBand6TotalEffortsGen2: metric.velocityBand6TotalEffortsGen2 ?? null,
      hirDist: metric.hirDist ?? null,
      maxVel: metric.maxVel ?? null,
      accelB23TotEffsGen2: metric.accelB23TotEffsGen2 ?? null,
      totAs: metric.totAs ?? null,
      decelB23TotEffsGen2: metric.decelB23TotEffsGen2 ?? null,
      // McBurnie 2022 — high-intensity decel inputs. Without these explicit
      // mappings, normalize.ts extracts the values into SessionMetric but
      // they're silently dropped by toNormalizedExternalLoad before reaching
      // sync.ts and the DB. This caused IMA Band 3 columns to stay NULL even
      // after Catapult was returning the data correctly.
      decelB3PlusTotEffsGen2: metric.decelB3PlusTotEffsGen2 ?? null,
      imaBand1DecelCount: metric.imaBand1DecelCount ?? null,
      imaBand2DecelCount: metric.imaBand2DecelCount ?? null,
      imaBand3DecelCount: metric.imaBand3DecelCount ?? null,
      imaBand1AccelCount: metric.imaBand1AccelCount ?? null,
      imaBand2AccelCount: metric.imaBand2AccelCount ?? null,
      imaBand3AccelCount: metric.imaBand3AccelCount ?? null,
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
      imaCodLeft: metric.imaCodLeft ?? null,
      imaCodRight: metric.imaCodRight ?? null,
      imaCodLeftHigh: metric.imaCodLeftHigh ?? null,
      imaCodLeftMedium: metric.imaCodLeftMedium ?? null,
      imaCodLeftLow: metric.imaCodLeftLow ?? null,
      imaCodRightHigh: metric.imaCodRightHigh ?? null,
      imaCodRightMedium: metric.imaCodRightMedium ?? null,
      imaCodRightLow: metric.imaCodRightLow ?? null,
      imaTotal: metric.imaTotal ?? null,
      codEvents: metric.codEvents ?? null,
      impacts: metric.impacts ?? null,
      jumps: metric.jumps ?? null,
      imaClock: metric.imaClock ?? null,
      avgHeartRate: metric.avgHeartRate ?? null,
      maxHeartRate: metric.maxHeartRate ?? null,
      minHeartRate: metric.minHeartRate ?? null,
      hrZone1TimeS: metric.hrZone1TimeS ?? null,
      hrZone2TimeS: metric.hrZone2TimeS ?? null,
      hrZone3TimeS: metric.hrZone3TimeS ?? null,
      hrZone4TimeS: metric.hrZone4TimeS ?? null,
      hrZone5TimeS: metric.hrZone5TimeS ?? null,
      hrZone6TimeS: metric.hrZone6TimeS ?? null,
      hrZone7TimeS: metric.hrZone7TimeS ?? null,
      hrZone8TimeS: metric.hrZone8TimeS ?? null,
      hrZone1AvgBpm: metric.hrZone1AvgBpm ?? null,
      hrZone2AvgBpm: metric.hrZone2AvgBpm ?? null,
      hrZone3AvgBpm: metric.hrZone3AvgBpm ?? null,
      hrZone4AvgBpm: metric.hrZone4AvgBpm ?? null,
      hrZone5AvgBpm: metric.hrZone5AvgBpm ?? null,
      hrZone6AvgBpm: metric.hrZone6AvgBpm ?? null,
      hrZone7AvgBpm: metric.hrZone7AvgBpm ?? null,
      hrZone8AvgBpm: metric.hrZone8AvgBpm ?? null,
      pctMaxHeartRate: metric.pctMaxHeartRate ?? null,
      pctAvgHeartRate: metric.pctAvgHeartRate ?? null,
      // FMP (Football Movement Profile)
      fmpVeryLowS: metric.fmpVeryLowS ?? null,
      fmpLowIntensityS: metric.fmpLowIntensityS ?? null,
      fmpRunningMediumS: metric.fmpRunningMediumS ?? null,
      fmpRunningHighS: metric.fmpRunningHighS ?? null,
      fmpDynamicLowS: metric.fmpDynamicLowS ?? null,
      fmpDynamicMediumS: metric.fmpDynamicMediumS ?? null,
      fmpDynamicHighS: metric.fmpDynamicHighS ?? null,
      // fmpTotalDurationS: prefer Catapult-direct value; fall back to sum of 6 bands
      fmpTotalDurationS: (() => {
        if (metric.fmpTotalDurationS != null && metric.fmpTotalDurationS > 0) return metric.fmpTotalDurationS;
        const bands = [
          metric.fmpVeryLowS,
          metric.fmpLowIntensityS,
          metric.fmpRunningMediumS,
          metric.fmpRunningHighS,
          metric.fmpDynamicMediumS,
          metric.fmpDynamicHighS,
        ];
        const sum = bands.reduce<number>((acc, v) => acc + (v ?? 0), 0);
        return sum > 0 ? sum : null;
      })(),
      // FMP percentages — derived from band_duration / computed_total × 100
      fmpDynamicHighPct: (() => {
        const total = (metric.fmpVeryLowS ?? 0) + (metric.fmpLowIntensityS ?? 0) + (metric.fmpRunningMediumS ?? 0) +
          (metric.fmpRunningHighS ?? 0) + (metric.fmpDynamicMediumS ?? 0) + (metric.fmpDynamicHighS ?? 0);
        if (total <= 0 || metric.fmpDynamicHighS == null) return null;
        return Number(((metric.fmpDynamicHighS / total) * 100).toFixed(2));
      })(),
      fmpDynamicMediumPct: (() => {
        const total = (metric.fmpVeryLowS ?? 0) + (metric.fmpLowIntensityS ?? 0) + (metric.fmpRunningMediumS ?? 0) +
          (metric.fmpRunningHighS ?? 0) + (metric.fmpDynamicMediumS ?? 0) + (metric.fmpDynamicHighS ?? 0);
        if (total <= 0 || metric.fmpDynamicMediumS == null) return null;
        return Number(((metric.fmpDynamicMediumS / total) * 100).toFixed(2));
      })(),
      fmpRunningHighPct: (() => {
        const total = (metric.fmpVeryLowS ?? 0) + (metric.fmpLowIntensityS ?? 0) + (metric.fmpRunningMediumS ?? 0) +
          (metric.fmpRunningHighS ?? 0) + (metric.fmpDynamicMediumS ?? 0) + (metric.fmpDynamicHighS ?? 0);
        if (total <= 0 || metric.fmpRunningHighS == null) return null;
        return Number(((metric.fmpRunningHighS / total) * 100).toFixed(2));
      })(),
      durationMinutes: metric.durationMinutes ?? null,
      // IMA Free Running 8 bands — indoor stride detail
      imaFrBand1StrideCount: metric.imaFrBand1StrideCount ?? null,
      imaFrBand1AvgStrideRate: metric.imaFrBand1AvgStrideRate ?? null,
      imaFrBand1TotalPlayerLoad: metric.imaFrBand1TotalPlayerLoad ?? null,
      imaFrBand2StrideCount: metric.imaFrBand2StrideCount ?? null,
      imaFrBand2AvgStrideRate: metric.imaFrBand2AvgStrideRate ?? null,
      imaFrBand2TotalPlayerLoad: metric.imaFrBand2TotalPlayerLoad ?? null,
      imaFrBand3StrideCount: metric.imaFrBand3StrideCount ?? null,
      imaFrBand3AvgStrideRate: metric.imaFrBand3AvgStrideRate ?? null,
      imaFrBand3TotalPlayerLoad: metric.imaFrBand3TotalPlayerLoad ?? null,
      imaFrBand4StrideCount: metric.imaFrBand4StrideCount ?? null,
      imaFrBand4AvgStrideRate: metric.imaFrBand4AvgStrideRate ?? null,
      imaFrBand4TotalPlayerLoad: metric.imaFrBand4TotalPlayerLoad ?? null,
      imaFrBand5StrideCount: metric.imaFrBand5StrideCount ?? null,
      imaFrBand5AvgStrideRate: metric.imaFrBand5AvgStrideRate ?? null,
      imaFrBand5TotalPlayerLoad: metric.imaFrBand5TotalPlayerLoad ?? null,
      imaFrBand6StrideCount: metric.imaFrBand6StrideCount ?? null,
      imaFrBand6AvgStrideRate: metric.imaFrBand6AvgStrideRate ?? null,
      imaFrBand6TotalPlayerLoad: metric.imaFrBand6TotalPlayerLoad ?? null,
      imaFrBand7StrideCount: metric.imaFrBand7StrideCount ?? null,
      imaFrBand7AvgStrideRate: metric.imaFrBand7AvgStrideRate ?? null,
      imaFrBand7TotalPlayerLoad: metric.imaFrBand7TotalPlayerLoad ?? null,
      imaFrBand8StrideCount: metric.imaFrBand8StrideCount ?? null,
      imaFrBand8AvgStrideRate: metric.imaFrBand8AvgStrideRate ?? null,
      imaFrBand8TotalPlayerLoad: metric.imaFrBand8TotalPlayerLoad ?? null,
      imaFrBand5TotalDistance: metric.imaFrBand5TotalDistance ?? null,
      imaFrBand6TotalDistance: metric.imaFrBand6TotalDistance ?? null,
      imaFrBand7TotalDistance: metric.imaFrBand7TotalDistance ?? null,
      imaFrBand8TotalDistance: metric.imaFrBand8TotalDistance ?? null,
    },
  };
}

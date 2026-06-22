/**
 * WIMU normalize: convert parsed string-cell rows into typed
 * WimuSessionMetric records. Handles:
 *   - decimal separator: '.' or ',' (Spanish locale uses ,)
 *   - date formats: YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY, YYYY/MM/DD
 *   - empty / dash / N/A cells → null
 *   - duration in HH:MM:SS or "75 min" or just "75" → minutes
 *
 * Output WimuSessionMetric is one step before player-mapping. The next
 * stage (mapAthletes.ts, defer to follow-up) resolves athleteName →
 * micropulse player_id.
 */

import type { WimuMetricKey } from "./metricCatalog";
import type { WimuRawRow, WimuSessionMetric } from "./types";

/**
 * Parse a numeric cell that may be in either "1234.5" or "1234,5" form.
 * Empty / dash / N/A → null.
 */
export function parseNumber(value: string | undefined | null): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "-" || s === "—" || /^n\/?a$/i.test(s)) return null;

  // Handle European decimal separator: if the string contains a comma but
  // no dot, treat the comma as the decimal point. If it contains both, the
  // dot is decimal and the commas are thousand separators (English locale).
  let cleaned: string;
  if (s.includes(",") && !s.includes(".")) {
    cleaned = s.replace(/\s/g, "").replace(",", ".");
  } else {
    cleaned = s.replace(/,/g, "").replace(/\s/g, "");
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a date cell into ISO YYYY-MM-DD.
 * Accepts: 2026-04-24, 24/04/2026, 24.04.2026, 04/24/2026 (US fallback),
 * 2026/04/24. Returns null for unrecognized formats.
 */
export function parseDate(value: string | undefined | null): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;

  // ISO YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // European DD/MM/YYYY or DD.MM.YYYY
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    // Heuristic: if first number > 12 it must be the day → European order.
    // If second number > 12 it must be the month → US order (rare in WIMU).
    const first = Number(d);
    const second = Number(mo);
    if (first > 12) {
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    if (second > 12) {
      // US: MM/DD/YYYY (very rare for WIMU but possible if club is in NA)
      return `${y}-${d.padStart(2, "0")}-${mo.padStart(2, "0")}`;
    }
    // Ambiguous (both ≤12) — assume European since WIMU's home market is EU
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

/**
 * Parse a duration cell into minutes.
 * Accepts: "75", "75 min", "01:15:00", "75:00", "1h15m".
 */
export function parseDurationMinutes(value: string | undefined | null): number | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;

  // HH:MM:SS or MM:SS
  const colon = s.match(/^(\d+):(\d+)(?::(\d+))?$/);
  if (colon) {
    const a = Number(colon[1]);
    const b = Number(colon[2]);
    const c = colon[3] != null ? Number(colon[3]) : null;
    if (c != null) {
      // HH:MM:SS
      return a * 60 + b + c / 60;
    }
    // ambiguous: could be HH:MM or MM:SS. SPRO sessions are typically
    // 30-180 minutes, so if a > 6 it's probably MM:SS, else HH:MM.
    return a > 6 ? a + b / 60 : a * 60 + b;
  }

  // Compound "1h15m" / "1h 15min"
  const compound = s.match(/^(\d+)\s*h\s*(\d+)?\s*m?/i);
  if (compound) {
    const h = Number(compound[1]);
    const m = compound[2] ? Number(compound[2]) : 0;
    return h * 60 + m;
  }

  // Plain number with optional minutes suffix. Accept the Icelandic "mínútur"
  // / "mín." (accented í) as well as English "min"/"minutes" and a trailing dot.
  return parseNumber(s.replace(/\s*m[ií]n(?:utes?|útur)?\.?\s*$/i, ""));
}

/**
 * Convert one parsed WimuRawRow into a typed WimuSessionMetric. Returns
 * null if athlete name or date is missing — those are required for the
 * record to be usable downstream.
 */
export function normalizeWimuRow(row: WimuRawRow): WimuSessionMetric | null {
  const athleteName = (row.athleteName ?? "").trim();
  const date = parseDate(row.date ?? "");
  if (!athleteName || !date) return null;

  // Helper to pull a numeric cell by metric key
  const num = (key: WimuMetricKey): number | null => parseNumber(row.raw[key]);

  const m: WimuSessionMetric = {
    athleteName,
    date,
    sessionName: row.sessionName ?? null,
    durationMinutes: parseDurationMinutes(row.raw["durationMinutes"]),

    totalDistance:               num("totalDistance"),
    highSpeedDistance:           num("highSpeedDistance"),
    sprintDistance:              num("sprintDistance"),
    hirDistance:                 num("hirDistance"),

    accelerations:               num("accelerations"),
    decelerations:               num("decelerations"),
    sprintCount:                 num("sprintCount"),
    codEvents:                   num("codEvents"),

    maxVelocity:                 num("maxVelocity"),
    avgVelocity:                 num("avgVelocity"),

    playerLoad:                  num("playerLoad"),
    playerLoadPerMinute:         num("playerLoadPerMinute"),

    metabolicPower:              num("metabolicPower"),
    metabolicPowerPeak:          num("metabolicPowerPeak"),
    metabolicLoadScore:          num("metabolicLoadScore"),
    highMetabolicLoadDistanceM:  num("highMetabolicLoadDistanceM"),
    metabolicEnergyKj:           num("metabolicEnergyKj"),

    avgHeartRate:                num("avgHeartRate"),
    maxHeartRate:                num("maxHeartRate"),
    hrZone1TimeS:                num("hrZone1TimeS"),
    hrZone2TimeS:                num("hrZone2TimeS"),
    hrZone3TimeS:                num("hrZone3TimeS"),
    hrZone4TimeS:                num("hrZone4TimeS"),
    hrZone5TimeS:                num("hrZone5TimeS"),
  };

  return m;
}

/**
 * Aggregate multiple SPRO rows for the same (athlete, date) into one
 * record. Useful when an export contains multiple sessions per day or
 * separate row per drill — we sum volume metrics, take max for peak
 * metrics, weighted-average for rates.
 *
 * Strategy:
 *   - sums:      totalDistance, highSpeedDistance, sprintDistance, hirDistance,
 *                accelerations, decelerations, sprintCount, codEvents,
 *                playerLoad, hrZone[1-5]TimeS, metabolicEnergyKj,
 *                highMetabolicLoadDistanceM, durationMinutes
 *   - max:       maxVelocity, maxHeartRate, metabolicPowerPeak
 *   - weighted:  metabolicPower, avgHeartRate, avgVelocity, playerLoadPerMinute
 *                (weighted by durationMinutes)
 */
export function aggregateByAthleteDate(metrics: WimuSessionMetric[]): WimuSessionMetric[] {
  const groups = new Map<string, WimuSessionMetric[]>();
  for (const m of metrics) {
    const k = `${m.athleteName}__${m.date}`;
    const arr = groups.get(k) ?? [];
    arr.push(m);
    groups.set(k, arr);
  }

  const out: WimuSessionMetric[] = [];
  for (const arr of groups.values()) {
    if (arr.length === 1) {
      out.push(arr[0]);
      continue;
    }
    out.push(combineSessions(arr));
  }
  return out;
}

function combineSessions(arr: WimuSessionMetric[]): WimuSessionMetric {
  const sumOf = (k: keyof WimuSessionMetric): number | null => {
    const vals = arr.map((m) => m[k]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  };
  const maxOf = (k: keyof WimuSessionMetric): number | null => {
    const vals = arr.map((m) => m[k]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return vals.length ? Math.max(...vals) : null;
  };
  const weightedAvg = (k: keyof WimuSessionMetric): number | null => {
    let weightSum = 0;
    let valSum = 0;
    for (const m of arr) {
      const v = m[k];
      const w = m.durationMinutes;
      if (typeof v === "number" && Number.isFinite(v) && typeof w === "number" && w > 0) {
        valSum += v * w;
        weightSum += w;
      }
    }
    if (weightSum > 0) return valSum / weightSum;
    // fallback: simple mean if no durations available
    const vals = arr.map((m) => m[k]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };

  return {
    athleteName: arr[0].athleteName,
    date: arr[0].date,
    sessionName: arr.map((m) => m.sessionName).filter(Boolean).join(" + ") || null,

    durationMinutes:             sumOf("durationMinutes"),

    totalDistance:               sumOf("totalDistance"),
    highSpeedDistance:           sumOf("highSpeedDistance"),
    sprintDistance:              sumOf("sprintDistance"),
    hirDistance:                 sumOf("hirDistance"),

    accelerations:               sumOf("accelerations"),
    decelerations:               sumOf("decelerations"),
    sprintCount:                 sumOf("sprintCount"),
    codEvents:                   sumOf("codEvents"),

    maxVelocity:                 maxOf("maxVelocity"),
    avgVelocity:                 weightedAvg("avgVelocity"),

    playerLoad:                  sumOf("playerLoad"),
    playerLoadPerMinute:         weightedAvg("playerLoadPerMinute"),

    metabolicPower:              weightedAvg("metabolicPower"),
    metabolicPowerPeak:          maxOf("metabolicPowerPeak"),
    metabolicLoadScore:          sumOf("metabolicLoadScore"),
    highMetabolicLoadDistanceM:  sumOf("highMetabolicLoadDistanceM"),
    metabolicEnergyKj:           sumOf("metabolicEnergyKj"),

    avgHeartRate:                weightedAvg("avgHeartRate"),
    maxHeartRate:                maxOf("maxHeartRate"),
    hrZone1TimeS:                sumOf("hrZone1TimeS"),
    hrZone2TimeS:                sumOf("hrZone2TimeS"),
    hrZone3TimeS:                sumOf("hrZone3TimeS"),
    hrZone4TimeS:                sumOf("hrZone4TimeS"),
    hrZone5TimeS:                sumOf("hrZone5TimeS"),
  };
}

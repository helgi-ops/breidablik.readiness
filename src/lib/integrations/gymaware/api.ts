import "server-only";

import type { GymAwareSet } from "./types";

/**
 * GymAware Cloud API client.
 *
 * Authentication: Basic HTTP Auth
 *   - Username = Account ID
 *   - Password = API Token
 *
 * The summaries endpoint returns newline-separated JSON objects.
 * Docs: https://gymaware.com/gymaware-cloud-api-integration-guide/
 */

const GYMAWARE_API_BASE = "https://cloud.gymaware.com";

type GymAwareConfig = {
  accountId: string;
  apiToken: string;
};

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim().length) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

function asInt(v: unknown): number | null {
  const n = asNum(v);
  return n != null ? Math.round(n) : null;
}

/**
 * Fetch raw data from GymAware API using Basic Auth.
 * Returns parsed newline-delimited JSON objects.
 */
async function gymAwareFetch(
  config: GymAwareConfig,
  path: string,
  query?: Record<string, string | number>,
): Promise<unknown[]> {
  const url = new URL(`${GYMAWARE_API_BASE}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const credentials = Buffer.from(`${config.accountId}:${config.apiToken}`).toString("base64");

  console.log(`[GymAware API] → ${url.toString().replace(/\/\/[^@]+@/, "//***:***@")}`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
    },
    cache: "no-store",
  });

  console.log(`[GymAware API] ← status ${response.status} ${response.statusText} (Content-Type: ${response.headers.get("content-type") ?? "none"})`);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`[GymAware API] Error body: ${body.slice(0, 1000)}`);
    throw new Error(`GymAware API error ${response.status}: ${body.slice(0, 500)}`);
  }

  // GymAware returns newline-separated JSON (NDJSON)
  const text = await response.text();
  console.log(`[GymAware API] Response length: ${text.length} chars, first 500: ${text.slice(0, 500)}`);

  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const objects: unknown[] = [];

  for (const line of lines) {
    try {
      objects.push(JSON.parse(line));
    } catch {
      console.warn(`[GymAware API] Skipping malformed line: ${line.slice(0, 200)}`);
    }
  }

  console.log(`[GymAware API] Parsed ${objects.length} objects from ${lines.length} lines`);

  return objects;
}

/**
 * Fetch all athletes from GymAware Cloud.
 */
export async function fetchGymAwareAthletes(
  config: GymAwareConfig,
): Promise<Array<{ id: string; firstName: string; lastName: string }>> {
  const rows = await gymAwareFetch(config, "/api/athletes");
  const athletes: Array<{ id: string; firstName: string; lastName: string }> = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    // GymAware uses "reference" / "athleteReference" as the athlete ID
    const ref = asNum(r.reference) ?? asNum(r.athleteReference);
    const id = ref != null ? String(ref) : (asStr(r.id) ?? asStr(r.athlete_id));
    if (!id) continue;
    athletes.push({
      id,
      firstName: asStr(r.first_name) ?? asStr(r.firstName) ?? "",
      lastName: asStr(r.last_name) ?? asStr(r.lastName) ?? "",
    });
  }

  return athletes;
}

/**
 * Fetch VBT summaries (sets) from GymAware Cloud for a date range.
 *
 * Uses `start` and `end` epoch-second params (up to 1 month window).
 * Alternatively, uses `modifiedSince` for incremental sync.
 */
export async function fetchGymAwareSummaries(
  config: GymAwareConfig,
  opts: { startDate: string; endDate: string } | { modifiedSince: number },
): Promise<GymAwareSet[]> {
  const query: Record<string, string | number> = {};

  if ("modifiedSince" in opts) {
    query.modifiedSince = opts.modifiedSince;
  } else {
    // Convert YYYY-MM-DD to epoch seconds (UTC midnight)
    query.start = Math.floor(new Date(`${opts.startDate}T00:00:00Z`).getTime() / 1000);
    query.end = Math.floor(new Date(`${opts.endDate}T23:59:59Z`).getTime() / 1000);
  }

  const rows = await gymAwareFetch(config, "/api/summaries", query);
  const sets: GymAwareSet[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;

    // GymAware uses "reference" as the set/summary ID
    const refNum = asNum(r.reference);
    const setId = refNum != null ? String(refNum) : (asStr(r.id) ?? asStr(r.set_id) ?? asStr(r.summary_id));
    if (!setId) continue;

    // Parse date from epoch or ISO
    // GymAware uses "recorded" as epoch seconds
    let dateStr: string | null = null;
    const startTime = asNum(r.recorded) ?? asNum(r.startTime) ?? asNum(r.start_time) ?? asNum(r.timestamp);
    if (startTime != null) {
      const ms = startTime > 1e12 ? startTime : startTime * 1000;
      dateStr = new Date(ms).toISOString().slice(0, 10);
    }
    if (!dateStr && typeof r.date === "string") {
      const match = r.date.match(/^\d{4}-\d{2}-\d{2}/);
      if (match) dateStr = match[0];
    }
    if (!dateStr) continue;

    // GymAware uses "athleteReference" as the athlete ID
    const athleteRef = asNum(r.athleteReference) ?? asNum(r.athlete_reference);
    const athleteId = athleteRef != null ? String(athleteRef) : (
      asStr(r.athlete_id) ??
      asStr(r.athleteId) ??
      asStr((r.athlete as Record<string, unknown> | undefined)?.id) ??
      ""
    );
    if (!athleteId) continue;

    // GymAware uses "athleteName" in "Last, First" format
    const rawAthleteName = asStr(r.athleteName);
    let athleteName: string | null = null;
    if (rawAthleteName) {
      // Convert "Jónsson, Arnór Gauti" → "Arnór Gauti Jónsson"
      const parts = rawAthleteName.split(",").map((s) => s.trim());
      athleteName = parts.length >= 2 ? `${parts[1]} ${parts[0]}` : rawAthleteName;
    }

    // GymAware uses "exerciseName" for the exercise
    const exerciseName = asStr(r.exerciseName) ?? asStr(r.exercise_name) ?? asStr(r.exercise) ?? "Unknown";

    sets.push({
      setId,
      athleteId,
      athleteName,
      exerciseName,
      date: dateStr,
      // GymAware uses "barWeight" for load and "repCount" for reps
      loadKg: asNum(r.barWeight) ?? asNum(r.load) ?? asNum(r.weight) ?? asNum(r.load_kg),
      reps: asInt(r.repCount) ?? asInt(r.reps) ?? asInt(r.rep_count),
      // GymAware uses "meanVelocity" / "peakVelocity" / "meanPower" / "peakPower"
      concMeanVelocity: asNum(r.meanVelocity) ?? asNum(r.concMeanVelocity) ?? asNum(r.conc_mean_velocity) ?? asNum(r.mean_velocity),
      concPeakVelocity: asNum(r.peakVelocity) ?? asNum(r.concPeakVelocity) ?? asNum(r.conc_peak_velocity) ?? asNum(r.peak_velocity),
      concMeanPower: asNum(r.meanPower) ?? asNum(r.concMeanPower) ?? asNum(r.conc_mean_power) ?? asNum(r.mean_power),
      concPeakPower: asNum(r.peakPower) ?? asNum(r.concPeakPower) ?? asNum(r.conc_peak_power) ?? asNum(r.peak_power),
      eccMeanVelocity: asNum(r.eccMeanVelocity) ?? asNum(r.ecc_mean_velocity),
      eccPeakVelocity: asNum(r.eccPeakVelocity) ?? asNum(r.ecc_peak_velocity),
      height: asNum(r.height),
      dip: asNum(r.dip),
      isVbt: r.is_vbt === true || r.isVbt === true || r.vbt === true,
      raw: r,
    });
  }

  return sets;
}

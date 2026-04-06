import "server-only";

import type { StatSportActivity, StatSportAthlete, StatSportSessionMetric } from "./types";

// ─── StatSport Sonra API Client ─────────────────────────────────────────────
// This is a placeholder implementation. Once you have a StatSport API key and
// access to the Sonra API documentation, replace the TODO stubs below with
// real HTTP calls.
//
// Environment variables required:
//   STATSPORT_API_KEY   — API key from StatSport
//   STATSPORT_API_BASE  — Base URL (default: https://api.statsports.com/v1)
//   STATSPORT_ORG_ID    — Organisation / team ID in Sonra
// ─────────────────────────────────────────────────────────────────────────────

type StatSportConfig = {
  baseUrl: string;
  apiKey: string;
  orgId: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export function getConfig(): StatSportConfig {
  return {
    baseUrl: (process.env.STATSPORT_API_BASE?.trim() || "https://api.statsports.com/v1").replace(/\/+$/, ""),
    apiKey: requiredEnv("STATSPORT_API_KEY"),
    orgId: requiredEnv("STATSPORT_ORG_ID"),
  };
}

export function isConfigured(): boolean {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

async function statsportFetch<T = unknown>(path: string): Promise<T> {
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Organization-Id": config.orgId,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`StatSport API ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}

// ─── Athletes ────────────────────────────────────────────────────────────────

export async function fetchStatSportAthletes(): Promise<StatSportAthlete[]> {
  // TODO: Replace with real Sonra API call when documentation is available.
  // Expected endpoint: GET /athletes or GET /players
  // Expected response: Array of { id, firstName, lastName, email? }
  //
  // Example:
  // const data = await statsportFetch<{ athletes: StatSportAthlete[] }>("/athletes");
  // return data.athletes;

  throw new Error(
    "StatSport API not yet configured. Contact StatSport to obtain API credentials and documentation."
  );
}

// ─── Activities / Sessions ───────────────────────────────────────────────────

export async function fetchActivitiesForDate(date?: string | null): Promise<StatSportActivity[]> {
  const dateKey = date ?? new Date().toISOString().slice(0, 10);

  // TODO: Replace with real Sonra API call.
  // Expected endpoint: GET /sessions?date=YYYY-MM-DD  or  GET /activities?from=...&to=...
  // Expected response: Array of { id, date, name, type }
  //
  // Example:
  // const data = await statsportFetch<{ sessions: StatSportActivity[] }>(`/sessions?date=${dateKey}`);
  // return data.sessions;

  throw new Error(
    "StatSport API not yet configured. Contact StatSport to obtain API credentials and documentation."
  );
}

// ─── Activity Stats (per athlete per activity) ──────────────────────────────

export async function fetchActivityStats(activityId: string): Promise<StatSportSessionMetric[]> {
  // TODO: Replace with real Sonra API call.
  // Expected endpoint: GET /sessions/{activityId}/stats  or  GET /sessions/{activityId}/athletes
  // Expected response: Array of per-athlete metric rows
  //
  // Map StatSport field names → StatSportSessionMetric fields:
  //   "Total Distance"           → totalDistance
  //   "High Speed Running"       → highSpeedDistance   (>19.8 km/h / 5.5 m/s)
  //   "Sprint Distance"          → sprintDistance      (>25.2 km/h / 7.0 m/s)
  //   "Dynamic Stress Load"      → playerLoad          (StatSport's equivalent of Player Load)
  //   "Max Speed"                → maxVelocity
  //   "Acceleration Count"       → accelerations
  //   "Deceleration Count"       → decelerations
  //   "Avg Heart Rate"           → avgHeartRate
  //   "Max Heart Rate"           → maxHeartRate
  //   "HR Zone 1/2/3/4/5 Time"  → hrZone1TimeS..hrZone5TimeS
  //   "High Metabolic Load Dist" → highMetabolicLoadDistanceM
  //   "Metabolic Power Avg"      → metabolicPower
  //   "Metabolic Power Peak"     → metabolicPowerPeak

  throw new Error(
    "StatSport API not yet configured. Contact StatSport to obtain API credentials and documentation."
  );
}

// ─── Convenience: all stats for a date ──────────────────────────────────────

export async function fetchAllStatsForDate(date?: string | null): Promise<StatSportSessionMetric[]> {
  const activities = await fetchActivitiesForDate(date);
  const all: StatSportSessionMetric[] = [];
  for (const activity of activities) {
    const stats = await fetchActivityStats(activity.id);
    all.push(...stats);
  }
  return all;
}

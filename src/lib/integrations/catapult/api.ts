import "server-only";

import type { CatapultActivity, CatapultAthlete } from "./types";

// These are the exact display-name strings that Catapult Stats API v6 recognises.
// DO NOT add snake_case or gen2_ variants — those cause "The given data was invalid" errors.

// Metabolic power display-name parameters for Catapult Stats API v6.
// These must be added to Reporting_Parameters in OpenField for the org.
// Using display names (not snake_case) — same pattern as IMA parameters.
export const CATAPULT_METABOLIC_PARAMETERS = [
  // Exact display names confirmed in OpenField Timeline (27 Mar 2026)
  "Peak Meta Power",              // peak metabolic power (W/kg)
  "Peak Metabolic Power",
  "Max Metabolic Power",
  "High Metabolic Load Dist (m)", // HMLD — exact UI name including unit suffix
  "High Metabolic Load Distance (m)",
  "Meta Energy (KJ/kg)",          // metabolic energy — KJ/kg (confirmed from Reporting_Parameters)
  "Meta Energy (Cal/kg)",
  // Fallback variants without unit suffixes (API may strip them)
  "High Metabolic Load Dist",
  "High Metabolic Load Distance",
  "Meta Energy",
  "Metabolic Energy",
  "Energy Expenditure",
  // Other possible names depending on Catapult version
  "Metabolic Power Avg",
  "Avg Metabolic Power",
  "Average Metabolic Power",
  "Metabolic Power Max",
  "Time In High Metabolic Zone",
  "Time In HML Zone",
  "High Metabolic Load Duration",
  "Time Above HML Threshold",
];

export const CATAPULT_IMA_PARAMETERS = [
  "IMA Accel High",
  "IMA Accel Medium",
  "IMA Accel Low",
  "IMA Decel High",
  "IMA Decel Medium",
  "IMA Decel Low",
  "IMA CoD Left High",
  "IMA CoD Left Medium",
  "IMA CoD Left Low",
  "IMA CoD Right High",
  "IMA CoD Right Medium",
  "IMA CoD Right Low",
  "IMA Impacts Band 1 Count",
  "IMA Impacts Band 2 Count",
  "IMA Impacts Band 3 Count",
  "IMA Impacts Band 4 Count",
  "IMA Impacts Band 5 Count",
  "IMA Impacts Band 6 Count",
  "IMA Impacts Band 7 Count",
  "IMA Impacts Band 8 Count",
];

const CATAPULT_BASE_PARAMETERS = [
  "total_distance",
  "velocity_band5_total_distance",
  "velocity_band6_total_distance",
  "hir_dist",
  "max_vel",
  "gen2_acceleration_band7plus_total_effort_count",
  "gen2_acceleration_band6plus_average_effort_count",
  "gen2_acceleration_band2plus_total_effort_count",
  "gen2_acceleration_band3plus_average_effort_count",
  "total_player_load",
  "player_load_per_minute",
];

// Sprint Count parameters — exact display names from Breiðablik OpenField
// Reporting_Parameters (confirmed 25 Apr 2026 from settings/parameters page).
// Used for McBurnie 2022 Decel:Sprint coupling.
export const CATAPULT_SPRINT_COUNT_PARAMETERS = [
  // PRIMARY — exact display names from OpenField Reporting_Parameters
  "Sprint Efforts",            // → velocity_band6_total_efforts_gen2 (sprint count)
  "HS Efforts",                // → velocity_band5_total_efforts_gen2 (high-speed count)
  "Sprint Dist Per Min",       // optional — sprint distance per minute
  "HS Distance",               // optional — high-speed distance
  "HS Dist Per Min",           // optional — high-speed distance per minute
  // Legacy display-name guesses (kept as fallback for orgs with different naming)
  "Velocity B6+ Total # Efforts (Gen 2)",
  "Velocity B5+ Total # Efforts (Gen 2)",
];

// McBurnie 2022 high-intensity decel parameter — must be enabled in OpenField
// Reporting_Parameters before data populates. Once present, McBurnie SQL
// functions prefer this over the combined b2-3 metric because b2 (moderate
// 2-3 m/s²) is biomechanical noise — only band 3 events (>3 m/s²) match the
// eccentric loading demand of sprint braking.
//
// PRIMARY display name "Deceleration B3 Efforts (Gen 2)" confirmed in
// Breiðablik's OpenField Reporting_Parameters page (28 Apr 2026).
// Note Catapult uses "B3" (not "B3+") because there is no higher decel band —
// band 3 IS the highest-intensity bucket (>3 m/s²) in their 3-band scheme.
//
// Coach instructions:
//   OpenField → Settings → Reporting Parameters →
//   add "Deceleration B3 Efforts (Gen 2)" → Update Parameter Group →
//   wait for next sync (or trigger /api/integrations/catapult/daily-sync).
export const CATAPULT_DECEL_B3_PLUS_PARAMETERS = [
  // PRIMARY — exact display name from OpenField (28 Apr 2026)
  "Deceleration B3 Efforts (Gen 2)",
  // Alternate phrasings other orgs may have set up
  "Decel B3 Efforts (Gen 2)",
  "Decel B3 Total # Efforts (Gen 2)",
  "Deceleration B3 Total # Efforts (Gen 2)",
  // Legacy "+" variants kept as last-ditch fallback for orgs using the
  // band3plus convention that mirrors accel naming
  "Decel B3+ Total # Efforts (Gen 2)",
  "Deceleration B3+ Total # Efforts (Gen 2)",
];

// IMA Free Running parameters — 8 stride velocity bands, IMU-only (works indoor)
// User confirmed all 8 bands enabled in OpenField Reporting_Parameters (25 Apr 2026)
// because Icelandic indoor halls are often 100m+ long, so high bands (7-8) capture
// real sprint events. Each band gets 3 metrics: stride count, avg stride rate, player load.
export const CATAPULT_FREE_RUNNING_PARAMETERS = [
  "IMA Free Running Band 1 Stride Count",
  "IMA Free Running Band 1 Average Stride Rate",
  "IMA Free Running Band 1 Total Player Load",
  "IMA Free Running Band 2 Stride Count",
  "IMA Free Running Band 2 Average Stride Rate",
  "IMA Free Running Band 2 Total Player Load",
  "IMA Free Running Band 3 Stride Count",
  "IMA Free Running Band 3 Average Stride Rate",
  "IMA Free Running Band 3 Total Player Load",
  "IMA Free Running Band 4 Stride Count",
  "IMA Free Running Band 4 Average Stride Rate",
  "IMA Free Running Band 4 Total Player Load",
  "IMA Free Running Band 5 Stride Count",
  "IMA Free Running Band 5 Average Stride Rate",
  "IMA Free Running Band 5 Total Player Load",
  "IMA Free Running Band 6 Stride Count",
  "IMA Free Running Band 6 Average Stride Rate",
  "IMA Free Running Band 6 Total Player Load",
  "IMA Free Running Band 7 Stride Count",
  "IMA Free Running Band 7 Average Stride Rate",
  "IMA Free Running Band 7 Total Player Load",
  "IMA Free Running Band 8 Stride Count",
  "IMA Free Running Band 8 Average Stride Rate",
  "IMA Free Running Band 8 Total Player Load",
];

// Football Movement Profile (FMP) — inertial sensor based, works indoors.
// Catapult's 6 movement categories:
//   Very Low, Low, Running Medium, Running High, Dynamic Medium, Dynamic High
// Exact display names confirmed from OpenField Settings > Parameters (8 Apr 2026).
export const CATAPULT_FMP_PARAMETERS = [
  // Duration parameters (seconds) — exact names from OpenField
  "FMP Very Low Duration",
  "FMP Low Duration",
  "FMP Running Medium Duration",
  "FMP Running High Duration",
  "FMP Dynamic Medium Duration",
  "FMP Dynamic High Duration",
  "FMP Total Dynamic Duration",
  "FMP Total Running Duration",
  // Percentage variants (exact from OpenField)
  "FMP Very Low Duration %",
  "FMP Low Duration %",
  "FMP Running Medium Duration %",
  "FMP Running High Duration %",
  "FMP Dynamic Medium Duration %",
  "FMP Dynamic High Duration %",
  "FMP Total Dynamic Duration %",
  "FMP Total Running Duration %",
  // Session averages (may be returned by some orgs)
  "FMP Very Low Duration Average (Session)",
  "FMP Low Duration Average (Session)",
  "FMP Running Medium Duration Average (Session)",
  "FMP Running High Duration Average (Session)",
  "FMP Dynamic Medium Duration Average (Session)",
  "FMP Dynamic High Duration Average (Session)",
  "FMP Total Dynamic Duration Average (Session)",
  "FMP Total Running Duration Average (Session)",
];

export type CatapultConfig = {
  baseUrl: string;
  apiKey: string;
  orgId: string;
  teamId?: string; // MicroPulse team_id (for logging/context)
};

type JsonObject = Record<string, unknown>;

const DEFAULT_BASE_URL = "https://backend-eu.openfield.catapultsports.com";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

/** Legacy: read Catapult credentials from environment variables */
export function getConfigFromEnv(): CatapultConfig {
  return {
    baseUrl: (process.env.CATAPULT_API_BASE?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    apiKey: requiredEnv("CATAPULT_API_KEY"),
    orgId: requiredEnv("CATAPULT_ORG_ID"),
  };
}

/**
 * Read Catapult credentials for a specific team from team_settings.
 * Falls back to env vars if no DB credentials found.
 */
export async function getConfigForTeam(teamId: string): Promise<CatapultConfig | null> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data } = await sb
      .from("team_settings")
      .select("catapult_api_key, catapult_org_id, catapult_api_base")
      .eq("team_id", teamId)
      .maybeSingle();
    const row = data as { catapult_api_key?: string | null; catapult_org_id?: string | null; catapult_api_base?: string | null } | null;
    if (row?.catapult_api_key && row?.catapult_org_id) {
      return {
        baseUrl: (row.catapult_api_base?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
        apiKey: row.catapult_api_key.trim(),
        orgId: row.catapult_org_id.trim(),
        teamId,
      };
    }
  } catch {
    // DB unavailable — fall through
  }
  return null;
}

/**
 * Fetch all teams that have Catapult credentials configured in team_settings.
 */
export async function getTeamsWithCatapultCredentials(): Promise<CatapultConfig[]> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data } = await sb
      .from("team_settings")
      .select("team_id, catapult_api_key, catapult_org_id, catapult_api_base")
      .not("catapult_api_key", "is", null)
      .not("catapult_org_id", "is", null);
    if (!data) return [];
    return (data as Array<{ team_id: string; catapult_api_key: string; catapult_org_id: string; catapult_api_base?: string | null }>)
      .filter(r => r.catapult_api_key && r.catapult_org_id)
      .map(r => ({
        baseUrl: (r.catapult_api_base?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
        apiKey: r.catapult_api_key.trim(),
        orgId: r.catapult_org_id.trim(),
        teamId: r.team_id,
      }));
  } catch {
    return [];
  }
}

// ── Module-level config override for multi-team sync ──────────────
// Set before calling fetch functions to route requests to the right org.
let _activeConfig: CatapultConfig | null = null;

/** Set the active Catapult config for subsequent API calls. Pass null to reset to env vars. */
export function setActiveCatapultConfig(config: CatapultConfig | null): void {
  _activeConfig = config;
}

function getConfig(): CatapultConfig {
  if (_activeConfig) return _activeConfig;
  return getConfigFromEnv();
}

function asRecord(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toDateKey(value: unknown): string | null {
  const direct = asString(value);
  if (direct) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
    const fromIso = new Date(direct);
    if (!Number.isNaN(fromIso.getTime())) return fromIso.toISOString().slice(0, 10);
  }

  const epochSeconds = asNumber(value);
  if (epochSeconds != null) {
    const millis = epochSeconds > 1e12 ? epochSeconds : epochSeconds * 1000;
    const fromEpoch = new Date(millis);
    if (!Number.isNaN(fromEpoch.getTime())) return fromEpoch.toISOString().slice(0, 10);
  }

  return null;
}

function resolveList(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  for (const key of keys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function resolveNextPage(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) return null;
  const direct = asString(record.next);
  if (direct) return direct;
  const pagination = asRecord(record.pagination);
  if (pagination) {
    return asString(pagination.next) ?? asString(pagination.next_cursor) ?? null;
  }
  const meta = asRecord(record.meta);
  if (meta) return asString(meta.next) ?? asString(meta.next_cursor) ?? null;
  const links = asRecord(record.links);
  if (links) return asString(links.next) ?? null;
  return null;
}

async function catapultFetch(path: string, query?: Record<string, string | number | null | undefined>): Promise<unknown> {
  const config = getConfig();
  const url = new URL(path.startsWith("http") ? path : `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("org_id", config.orgId);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null) continue;
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "x-api-key": config.apiKey,
        "x-org-id": config.orgId,
      },
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch failure";
    throw new Error(`Catapult network request failed for ${url.origin}: ${message}`);
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    throw new Error(`Catapult rate limit reached${retryAfter ? ` (retry after ${retryAfter}s)` : ""}`);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      asString(asRecord(payload)?.message) ??
      asString(asRecord(payload)?.error) ??
      `Catapult API request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

async function catapultPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const config = getConfig();
  const url = new URL(path.startsWith("http") ? path : `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("org_id", config.orgId);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        "x-api-key": config.apiKey,
        "x-org-id": config.orgId,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown fetch failure";
    throw new Error(`Catapult network request failed for ${url.origin}: ${message}`);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      asString(asRecord(payload)?.message) ??
      asString(asRecord(payload)?.error) ??
      asString(asRecord(asRecord(payload)?.errors)?.message) ??
      `Catapult API request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
}

function isPlainJsonObject(value: unknown): value is JsonObject {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function mergeStatsRow(base: JsonObject, extra: JsonObject): JsonObject {
  const merged: JsonObject = { ...base };

  for (const [key, extraValue] of Object.entries(extra)) {
    const baseValue = merged[key];

    if (Array.isArray(baseValue) && Array.isArray(extraValue)) {
      merged[key] = extraValue.length ? extraValue : baseValue;
      continue;
    }

    if (isPlainJsonObject(baseValue) && isPlainJsonObject(extraValue)) {
      merged[key] = mergeStatsRow(baseValue, extraValue);
      continue;
    }

    merged[key] = extraValue ?? baseValue;
  }

  return merged;
}

function normalizedToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || null;
}

function extractStatsRows(payload: unknown): JsonObject[] {
  if (Array.isArray(payload)) {
    // If items look like direct athlete rows (have athlete_id / athleteId / player_id at the
    // top level), return them directly instead of recursing into sub-paths.
    const records = payload.map((item) => asRecord(item)).filter((r): r is JsonObject => r != null);
    if (
      records.length > 0 &&
      records.some((r) => asString(r.athlete_id) || asString(r.athleteId) || asString(r.player_id))
    ) {
      return records;
    }
    return payload.flatMap((item) => extractStatsRows(item));
  }

  const record = asRecord(payload);
  if (!record) return [];

  if (Array.isArray(record.stats)) {
    return record.stats.map((row) => asRecord(row)).filter((row): row is JsonObject => row != null);
  }

  const statsRecord = asRecord(record.stats);
  if (statsRecord?.athletes && Array.isArray(statsRecord.athletes)) {
    return statsRecord.athletes
      .map((row) => asRecord(row))
      .filter((row): row is JsonObject => row != null);
  }

  const athletesRecord = asRecord(statsRecord?.athletes);
  if (athletesRecord?.data && Array.isArray(athletesRecord.data)) {
    return athletesRecord.data
      .map((row) => asRecord(row))
      .filter((row): row is JsonObject => row != null);
  }

  if (Array.isArray(record.data)) {
    return record.data.map((row) => asRecord(row)).filter((row): row is JsonObject => row != null);
  }

  const dataRecord = asRecord(record.data);
  if (dataRecord?.results && Array.isArray(dataRecord.results)) {
    return dataRecord.results
      .map((row) => asRecord(row))
      .filter((row): row is JsonObject => row != null);
  }

  const resultsRecord = asRecord(dataRecord?.results);
  if (resultsRecord?.items && Array.isArray(resultsRecord.items)) {
    return resultsRecord.items
      .map((row) => asRecord(row))
      .filter((row): row is JsonObject => row != null);
  }

  if (Array.isArray(record.results)) {
    return record.results
      .map((row) => asRecord(row))
      .filter((row): row is JsonObject => row != null);
  }

  const topResultsRecord = asRecord(record.results);
  if (topResultsRecord?.items && Array.isArray(topResultsRecord.items)) {
    return topResultsRecord.items
      .map((row) => asRecord(row))
      .filter((row): row is JsonObject => row != null);
  }

  return [];
}

function athleteNameKeyForStatsRow(row: JsonObject): string | null {
  const athlete = asRecord(row.athlete);
  const first =
    asString(row.first_name) ??
    asString(row.firstName) ??
    asString(athlete?.first_name) ??
    asString(athlete?.firstName);
  const last =
    asString(row.last_name) ??
    asString(row.lastName) ??
    asString(athlete?.last_name) ??
    asString(athlete?.lastName);
  const full =
    asString(row.full_name) ??
    asString(row.fullName) ??
    asString(row.athlete_name) ??
    asString(row.athleteName) ??
    asString(athlete?.full_name) ??
    asString(athlete?.fullName) ??
    asString(athlete?.name);
  const email = asString(row.email) ?? asString(athlete?.email);

  const fullKey = normalizedToken(full);
  if (fullKey) return `name:${fullKey}`;

  const combined = normalizedToken([first, last].filter(Boolean).join(" "));
  if (combined) return `name:${combined}`;

  const emailKey = normalizedToken(email);
  return emailKey ? `email:${emailKey}` : null;
}

function athleteKeyForStatsRow(row: JsonObject): string | null {
  return (
    asString(row.athlete_id) ??
    asString(row.athleteId) ??
    asString(row.player_id) ??
    asString(row.playerId) ??
    asString(row.id) ??
    asString(asRecord(row.athlete)?.id) ??
    athleteNameKeyForStatsRow(row)
  );
}

function replaceStatsRowsAtKnownPath(payload: unknown, rows: JsonObject[]): unknown {
  const record = asRecord(payload);
  if (!record) return rows;

  if (Array.isArray(record.stats)) {
    return { ...record, stats: rows };
  }

  const statsRecord = asRecord(record.stats);
  if (statsRecord && Array.isArray(statsRecord.athletes)) {
    return { ...record, stats: { ...statsRecord, athletes: rows } };
  }

  if (statsRecord) {
    const athletesRecord = asRecord(statsRecord.athletes);
    if (athletesRecord && Array.isArray(athletesRecord.data)) {
      return {
        ...record,
        stats: { ...statsRecord, athletes: { ...athletesRecord, data: rows } },
      };
    }
  }

  if (Array.isArray(record.athletes)) {
    return { ...record, athletes: rows };
  }

  if (Array.isArray(record.data)) {
    return { ...record, data: rows };
  }

  const dataRecord = asRecord(record.data);
  if (dataRecord && Array.isArray(dataRecord.results)) {
    return { ...record, data: { ...dataRecord, results: rows } };
  }

  if (dataRecord) {
    const resultsRecord = asRecord(dataRecord.results);
    if (resultsRecord && Array.isArray(resultsRecord.items)) {
      return {
        ...record,
        data: { ...dataRecord, results: { ...resultsRecord, items: rows } },
      };
    }
  }

  if (Array.isArray(record.results)) {
    return { ...record, results: rows };
  }

  const resultsRecord = asRecord(record.results);
  if (resultsRecord && Array.isArray(resultsRecord.items)) {
    return { ...record, results: { ...resultsRecord, items: rows } };
  }

  if (Array.isArray(record.items)) {
    return { ...record, items: rows };
  }

  return { ...record, data: rows };
}

function mergeStatsPayloads(basePayload: unknown, extraPayload: unknown): unknown {
  const baseRows = extractStatsRows(basePayload);
  const extraRows = extractStatsRows(extraPayload);
  if (!baseRows.length || !extraRows.length) {
    return basePayload;
  }

  const mergedRows = baseRows.map((row) => ({ ...row }));
  const keyedBaseIndexes = new Map<string, number>();

  for (const [index, row] of mergedRows.entries()) {
    const key = athleteKeyForStatsRow(row);
    if (!key) continue;
    keyedBaseIndexes.set(key, index);
  }

  for (const [index, row] of extraRows.entries()) {
    const key = athleteKeyForStatsRow(row);
    const targetIndex =
      (key ? keyedBaseIndexes.get(key) : undefined) ??
      (index < mergedRows.length ? index : undefined);

    if (targetIndex == null) continue;
    mergedRows[targetIndex] = mergeStatsRow(mergedRows[targetIndex], row);
  }

  return replaceStatsRowsAtKnownPath(basePayload, mergedRows);
}

async function fetchPaginated(path: string, listKeys: string[], query?: Record<string, string | number | null | undefined>): Promise<unknown[]> {
  const items: unknown[] = [];
  let nextPath: string | null = path;
  let nextQuery = query ?? {};

  while (nextPath) {
    const payload = await catapultFetch(nextPath, nextQuery);
    items.push(...resolveList(payload, listKeys));
    const next = resolveNextPage(payload);
    if (!next) break;
    nextPath = next;
    nextQuery = {};
  }

  return items;
}

export async function fetchCatapultAthletes(): Promise<CatapultAthlete[]> {
  const rows = await fetchPaginated("/api/v6/athletes", ["athletes", "data", "results", "items"]);
  const athletes: CatapultAthlete[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const id = asString(record.id) ?? asString(record.athlete_id);
    if (!id) continue;
    athletes.push({
      id,
      firstName: asString(record.first_name) ?? asString(record.firstName) ?? "",
      lastName: asString(record.last_name) ?? asString(record.lastName) ?? "",
      email: asString(record.email) ?? null,
    });
  }
  return athletes;
}

/**
 * Parse a single activity record into a CatapultActivity, or null if invalid.
 * The Catapult activities endpoint ignores server-side date filters, so all
 * date filtering is done client-side here.
 */
function parseActivityRecord(row: unknown): (CatapultActivity & { date: string }) | null {
  const record = asRecord(row);
  if (!record) return null;
  // The /api/v6/activities endpoint returns period objects that have both `id`
  // (the period UUID) and `activity_id` (the parent session UUID). The stats API
  // expects the SESSION id, so prefer activity_id over id.
  const id = asString(record.activity_id) ?? asString(record.id);
  const activityDate =
    toDateKey(record.date) ??
    toDateKey(record.activity_date) ??
    toDateKey(record.start_date) ??
    toDateKey(record.start_time) ??
    toDateKey(record.end_time);
  if (!id || !activityDate) return null;
  return {
    id,
    date: activityDate,
    name: asString(record.name) ?? asString(record.title) ?? null,
  };
}

export async function fetchActivitiesForDate(date: string): Promise<CatapultActivity[]> {
  // NOTE: The Catapult /api/v6/activities endpoint ignores start_time/end_time
  // query params regardless of format (ISO or epoch). We fetch all activities
  // and filter client-side by date.
  const rows = await fetchPaginated("/api/v6/activities", ["activities", "data", "results", "items"]);
  return rows
    .map(parseActivityRecord)
    .filter((a): a is CatapultActivity & { date: string } => a !== null && a.date === date);
}

/**
 * Fetch all Catapult activities within a date range in one paginated scan.
 * Returns a map of date → activity IDs, useful for batch backfill operations.
 */
export async function fetchActivitiesForDateRange(
  dateFrom: string,
  dateTo: string,
): Promise<Map<string, CatapultActivity[]>> {
  const rows = await fetchPaginated("/api/v6/activities", ["activities", "data", "results", "items"]);
  const byDate = new Map<string, CatapultActivity[]>();
  // Deduplicate by activity id — the same session may appear as multiple period rows
  const seenIds = new Set<string>();
  for (const row of rows) {
    const activity = parseActivityRecord(row);
    if (!activity) continue;
    if (activity.date < dateFrom || activity.date > dateTo) continue;
    if (seenIds.has(activity.id)) continue;
    seenIds.add(activity.id);
    const existing = byDate.get(activity.date) ?? [];
    existing.push(activity);
    byDate.set(activity.date, existing);
  }
  return byDate;
}

export async function fetchActivityStats(activityId: string): Promise<unknown> {
  const basePayload = await catapultPost("/api/v6/stats", {
    group_by: ["athlete"],
    filters: [
      {
        name: "activity_id",
        comparison: "=",
        values: [activityId],
      },
    ],
    parameters: [...CATAPULT_BASE_PARAMETERS, ...CATAPULT_IMA_PARAMETERS],
    requested_only: false,
  });

  // Fetch IMA and metabolic display-name parameters with requested_only:true so they
  // are returned even when not in the org's default Reporting_Parameters group.
  // Both are fire-and-forget — a failure falls back to the base payload.
  let mergedPayload = basePayload;

  try {
    const imaOnlyPayload = await catapultPost("/api/v6/stats", {
      group_by: ["athlete"],
      filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
      parameters: CATAPULT_IMA_PARAMETERS,
      requested_only: true,
    });
    mergedPayload = mergeStatsPayloads(mergedPayload, imaOnlyPayload);
  } catch {
    // IMA fetch failed — continue with base payload
  }

  try {
    const metabolicOnlyPayload = await catapultPost("/api/v6/stats", {
      group_by: ["athlete"],
      filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
      parameters: CATAPULT_METABOLIC_PARAMETERS,
      requested_only: false,
    });
    mergedPayload = mergeStatsPayloads(mergedPayload, metabolicOnlyPayload);
  } catch {
    // Metabolic fetch failed — continue without metabolic data
  }

  // FMP (Football Movement Profile) — inertial sensor based, works indoors
  try {
    const fmpPayload = await catapultPost("/api/v6/stats", {
      group_by: ["athlete"],
      filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
      parameters: CATAPULT_FMP_PARAMETERS,
      requested_only: true,
    });
    mergedPayload = mergeStatsPayloads(mergedPayload, fmpPayload);
  } catch {
    // FMP fetch failed — continue without FMP data
  }

  // Sprint count parameters — Velocity B6+ Total # Efforts (Gen 2) etc.
  // Try each display-name variant individually so a single bad name doesn't
  // poison the whole batch (Catapult rejects the entire request on unknown name).
  for (const paramName of CATAPULT_SPRINT_COUNT_PARAMETERS) {
    try {
      const sprintPayload = await catapultPost("/api/v6/stats", {
        group_by: ["athlete"],
        filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
        parameters: [paramName],
        requested_only: true,
      });
      mergedPayload = mergeStatsPayloads(mergedPayload, sprintPayload);
    } catch {
      // This particular variant failed — try the next one
    }
  }

  // McBurnie 2022 Decel B3+ — high-intensity-only decel count.
  // Same per-param strategy as sprint counts above. Will silently no-op until
  // the parameter is enabled in the org's OpenField Reporting_Parameters.
  for (const paramName of CATAPULT_DECEL_B3_PLUS_PARAMETERS) {
    try {
      const decelPayload = await catapultPost("/api/v6/stats", {
        group_by: ["athlete"],
        filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
        parameters: [paramName],
        requested_only: true,
      });
      mergedPayload = mergeStatsPayloads(mergedPayload, decelPayload);
    } catch {
      // This particular variant failed — try the next one
    }
  }

  // IMA Free Running 8-band — try as ONE batch first, fall back to per-param probe
  // (Catapult sometimes rejects batch with unknown name; per-param probe is more robust)
  try {
    const freeRunningPayload = await catapultPost("/api/v6/stats", {
      group_by: ["athlete"],
      filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
      parameters: CATAPULT_FREE_RUNNING_PARAMETERS,
      requested_only: true,
    });
    mergedPayload = mergeStatsPayloads(mergedPayload, freeRunningPayload);
  } catch {
    // Batch failed — try each parameter individually
    for (const paramName of CATAPULT_FREE_RUNNING_PARAMETERS) {
      try {
        const singlePayload = await catapultPost("/api/v6/stats", {
          group_by: ["athlete"],
          filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
          parameters: [paramName],
          requested_only: true,
        });
        mergedPayload = mergeStatsPayloads(mergedPayload, singlePayload);
      } catch {
        // This particular variant failed — try the next one
      }
    }
  }

  return mergedPayload;
}

export async function fetchActivityStatsDetailed(activityId: string): Promise<{
  basePayload: unknown;
  imaOnlyPayload: unknown | null;
  metabolicOnlyPayload: unknown | null;
  fmpOnlyPayload: unknown | null;
  sprintCountOnlyPayload: unknown | null;
  sprintCountProbeResults: Array<{
    parameter: string;
    success: boolean;
    error: string | null;
    returnedKeys: string[];
    sampleValues: Record<string, unknown>;
  }>;
  freeRunningOnlyPayload: unknown | null;
  freeRunningOnlyError: string | null;
  freeRunningBatchSucceeded: boolean;
  freeRunningProbeResults: Array<{ parameter: string; success: boolean; error: string | null }>;
  mergedPayload: unknown;
  imaOnlyError: string | null;
  metabolicOnlyError: string | null;
  fmpOnlyError: string | null;
  imaOnlyParameters: string[];
  metabolicOnlyParameters: string[];
  fmpOnlyParameters: string[];
  sprintCountParameters: string[];
  freeRunningParameters: string[];
}> {
  const basePayload = await catapultPost("/api/v6/stats", {
    group_by: ["athlete"],
    filters: [
      {
        name: "activity_id",
        comparison: "=",
        values: [activityId],
      },
    ],
    parameters: [...CATAPULT_BASE_PARAMETERS, ...CATAPULT_IMA_PARAMETERS],
    requested_only: false,
  });

  let mergedPayload: unknown = basePayload;
  let imaOnlyPayload: unknown | null = null;
  let imaOnlyError: string | null = null;
  let metabolicOnlyPayload: unknown | null = null;
  let metabolicOnlyError: string | null = null;

  try {
    imaOnlyPayload = await catapultPost("/api/v6/stats", {
      group_by: ["athlete"],
      filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
      parameters: CATAPULT_IMA_PARAMETERS,
      requested_only: true,
    });
    mergedPayload = mergeStatsPayloads(mergedPayload, imaOnlyPayload);
  } catch (error) {
    imaOnlyError = error instanceof Error ? error.message : "Unknown IMA-only fetch error";
  }

  try {
    metabolicOnlyPayload = await catapultPost("/api/v6/stats", {
      group_by: ["athlete"],
      filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
      parameters: CATAPULT_METABOLIC_PARAMETERS,
      requested_only: false,
    });
    mergedPayload = mergeStatsPayloads(mergedPayload, metabolicOnlyPayload);
  } catch (error) {
    metabolicOnlyError = error instanceof Error ? error.message : "Unknown metabolic-only fetch error";
  }

  let fmpOnlyPayload: unknown | null = null;
  let fmpOnlyError: string | null = null;

  try {
    fmpOnlyPayload = await catapultPost("/api/v6/stats", {
      group_by: ["athlete"],
      filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
      parameters: CATAPULT_FMP_PARAMETERS,
      requested_only: true,
    });
    mergedPayload = mergeStatsPayloads(mergedPayload, fmpOnlyPayload);
  } catch (error) {
    fmpOnlyError = error instanceof Error ? error.message : "Unknown FMP-only fetch error";
  }

  // IMA Free Running probe — batch first, then per-param fallback. Track which succeeded.
  let freeRunningOnlyPayload: unknown | null = null;
  let freeRunningOnlyError: string | null = null;
  let freeRunningBatchSucceeded = false;
  try {
    freeRunningOnlyPayload = await catapultPost("/api/v6/stats", {
      group_by: ["athlete"],
      filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
      parameters: CATAPULT_FREE_RUNNING_PARAMETERS,
      requested_only: true,
    });
    mergedPayload = mergeStatsPayloads(mergedPayload, freeRunningOnlyPayload);
    freeRunningBatchSucceeded = true;
  } catch (error) {
    freeRunningOnlyError = error instanceof Error ? error.message : "Unknown Free Running batch fetch error";
  }
  // Per-param probe regardless — collect which names work
  const freeRunningProbeResults: Array<{ parameter: string; success: boolean; error: string | null }> = [];
  for (const paramName of CATAPULT_FREE_RUNNING_PARAMETERS) {
    try {
      const single = await catapultPost("/api/v6/stats", {
        group_by: ["athlete"],
        filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
        parameters: [paramName],
        requested_only: true,
      });
      freeRunningProbeResults.push({ parameter: paramName, success: true, error: null });
      if (!freeRunningBatchSucceeded) mergedPayload = mergeStatsPayloads(mergedPayload, single);
    } catch (error) {
      freeRunningProbeResults.push({
        parameter: paramName,
        success: false,
        error: error instanceof Error ? error.message : "Unknown",
      });
    }
  }

  // Sprint count probe — try each variant individually so we can isolate which name(s) Catapult accepts
  let sprintCountOnlyPayload: unknown | null = null;
  const sprintCountProbeResults: Array<{
    parameter: string;
    success: boolean;
    error: string | null;
    returnedKeys: string[];
    sampleValues: Record<string, unknown>;
  }> = [];

  // Snapshot the base payload's row-keys so we can diff against them per probe.
  // Catapult silently accepts ANY parameter name — we can only tell which one
  // worked by comparing the returned row-keys to the base row's keys.
  const baseRows = extractStatsRows(basePayload);
  const baseKeySet = new Set<string>();
  for (const row of baseRows.slice(0, 3)) {
    for (const k of Object.keys(row)) baseKeySet.add(k);
  }

  for (const paramName of CATAPULT_SPRINT_COUNT_PARAMETERS) {
    try {
      const sprintPayload = await catapultPost("/api/v6/stats", {
        group_by: ["athlete"],
        filters: [{ name: "activity_id", comparison: "=", values: [activityId] }],
        parameters: [paramName],
        requested_only: true,
      });
      // Extract ALL keys from first 3 rows of response (no filter)
      const rows = extractStatsRows(sprintPayload);
      const responseKeySet = new Set<string>();
      for (const row of rows.slice(0, 3)) {
        for (const k of Object.keys(row)) responseKeySet.add(k);
      }
      // True diff: keys present in this probe's response that were NOT in the base payload.
      // These are the keys actually populated by this specific parameter name.
      const newKeys = Array.from(responseKeySet).filter((k) => !baseKeySet.has(k)).sort();
      const firstRow = rows[0] ?? {};
      const sampleValues: Record<string, unknown> = {};
      for (const k of newKeys) sampleValues[k] = firstRow[k];

      sprintCountProbeResults.push({
        parameter: paramName,
        success: true,
        error: null,
        returnedKeys: newKeys,
        sampleValues,
      });

      // Use the first probe that revealed NEW keys as the canonical sprint payload
      if (sprintCountOnlyPayload == null && newKeys.length > 0) sprintCountOnlyPayload = sprintPayload;
      mergedPayload = mergeStatsPayloads(mergedPayload, sprintPayload);
    } catch (error) {
      sprintCountProbeResults.push({
        parameter: paramName,
        success: false,
        error: error instanceof Error ? error.message : "Unknown sprint-count probe error",
        returnedKeys: [],
        sampleValues: {},
      });
    }
  }

  return {
    basePayload,
    imaOnlyPayload,
    metabolicOnlyPayload,
    fmpOnlyPayload,
    sprintCountOnlyPayload,
    sprintCountProbeResults,
    freeRunningOnlyPayload,
    freeRunningOnlyError,
    freeRunningBatchSucceeded,
    freeRunningProbeResults,
    mergedPayload,
    imaOnlyError,
    metabolicOnlyError,
    fmpOnlyError,
    imaOnlyParameters: CATAPULT_IMA_PARAMETERS,
    metabolicOnlyParameters: CATAPULT_METABOLIC_PARAMETERS,
    fmpOnlyParameters: CATAPULT_FMP_PARAMETERS,
    sprintCountParameters: CATAPULT_SPRINT_COUNT_PARAMETERS,
    freeRunningParameters: CATAPULT_FREE_RUNNING_PARAMETERS,
  };
}

export async function fetchActivityStatsBatch(activityIds: string[]): Promise<unknown> {
  const ids = activityIds.map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return [];
  const payloads = await Promise.all(ids.map((id) => fetchActivityStats(id)));
  return payloads.flatMap((payload) => (Array.isArray(payload) ? payload : [payload]));
}

/**
 * Fetch stats for all athletes on a given date by filtering on period_start_time.
 * Used by the IMA patch backfill to avoid the need for activity IDs.
 */
export async function fetchStatsByDate(date: string): Promise<unknown> {
  const startTime = `${date}T00:00:00.000Z`;
  const endTime = `${date}T23:59:59.999Z`;

  const baseFilters = [
    { name: "period_start_time", comparison: ">=", values: [startTime] },
    { name: "period_start_time", comparison: "<", values: [endTime] },
  ];

  const basePayload = await catapultPost("/api/v6/stats", {
    group_by: ["athlete"],
    filters: baseFilters,
    parameters: [...CATAPULT_BASE_PARAMETERS, ...CATAPULT_IMA_PARAMETERS],
    requested_only: false,
  });

  let mergedPayload: unknown = basePayload;

  // IMA display-name fetch with requested_only:true for better coverage
  try {
    const imaPayload = await catapultPost("/api/v6/stats", {
      group_by: ["athlete"],
      filters: baseFilters,
      parameters: CATAPULT_IMA_PARAMETERS,
      requested_only: true,
    });
    mergedPayload = mergeStatsPayloads(mergedPayload, imaPayload);
  } catch {
    // IMA fetch failed — continue without
  }

  // Metabolic display-name fetch with requested_only:true
  try {
    const metabolicPayload = await catapultPost("/api/v6/stats", {
      group_by: ["athlete"],
      filters: baseFilters,
      parameters: CATAPULT_METABOLIC_PARAMETERS,
      requested_only: false,
    });
    mergedPayload = mergeStatsPayloads(mergedPayload, metabolicPayload);
  } catch {
    // Metabolic fetch failed — continue without
  }

  // FMP (Football Movement Profile) — inertial sensor based, works indoors
  try {
    const fmpPayload = await catapultPost("/api/v6/stats", {
      group_by: ["athlete"],
      filters: baseFilters,
      parameters: CATAPULT_FMP_PARAMETERS,
      requested_only: true,
    });
    mergedPayload = mergeStatsPayloads(mergedPayload, fmpPayload);
  } catch {
    // FMP fetch failed — continue without FMP data
  }

  // Sprint count parameters — try each variant individually
  for (const paramName of CATAPULT_SPRINT_COUNT_PARAMETERS) {
    try {
      const sprintPayload = await catapultPost("/api/v6/stats", {
        group_by: ["athlete"],
        filters: baseFilters,
        parameters: [paramName],
        requested_only: true,
      });
      mergedPayload = mergeStatsPayloads(mergedPayload, sprintPayload);
    } catch {
      // This particular variant failed — try the next one
    }
  }

  // McBurnie 2022 Decel B3+ — high-intensity-only decel count.
  // Same per-param strategy as sprint counts above. Will silently no-op until
  // the parameter is enabled in the org's OpenField Reporting_Parameters.
  for (const paramName of CATAPULT_DECEL_B3_PLUS_PARAMETERS) {
    try {
      const decelPayload = await catapultPost("/api/v6/stats", {
        group_by: ["athlete"],
        filters: baseFilters,
        parameters: [paramName],
        requested_only: true,
      });
      mergedPayload = mergeStatsPayloads(mergedPayload, decelPayload);
    } catch {
      // This particular variant failed — try the next one
    }
  }

  // IMA Free Running 8-band — try as ONE batch first, fall back to per-param probe
  try {
    const freeRunningPayload = await catapultPost("/api/v6/stats", {
      group_by: ["athlete"],
      filters: baseFilters,
      parameters: CATAPULT_FREE_RUNNING_PARAMETERS,
      requested_only: true,
    });
    mergedPayload = mergeStatsPayloads(mergedPayload, freeRunningPayload);
  } catch {
    for (const paramName of CATAPULT_FREE_RUNNING_PARAMETERS) {
      try {
        const singlePayload = await catapultPost("/api/v6/stats", {
          group_by: ["athlete"],
          filters: baseFilters,
          parameters: [paramName],
          requested_only: true,
        });
        mergedPayload = mergeStatsPayloads(mergedPayload, singlePayload);
      } catch {
        // try next variant
      }
    }
  }

  return mergedPayload;
}

import "server-only";

import type { CatapultActivity, CatapultAthlete } from "./types";

type CatapultConfig = {
  baseUrl: string;
  apiKey: string;
  orgId: string;
};

type JsonObject = Record<string, unknown>;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getConfig(): CatapultConfig {
  return {
    baseUrl: (process.env.CATAPULT_API_BASE?.trim() || "https://backend-eu.openfield.catapultsports.com").replace(/\/+$/, ""),
    apiKey: requiredEnv("CATAPULT_API_KEY"),
    orgId: requiredEnv("CATAPULT_ORG_ID"),
  };
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

export async function fetchActivitiesForDate(date: string): Promise<CatapultActivity[]> {
  const rows = await fetchPaginated("/api/v6/activities", ["activities", "data", "results", "items"], {
    start_time: `${date}T00:00:00Z`,
    end_time: `${date}T23:59:59Z`,
  });
  const activities: CatapultActivity[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record) continue;
    const id = asString(record.id) ?? asString(record.activity_id);
    const activityDate =
      toDateKey(record.date) ??
      toDateKey(record.activity_date) ??
      toDateKey(record.start_date) ??
      toDateKey(record.start_time) ??
      toDateKey(record.end_time);
    if (!id || !activityDate) continue;
    if (activityDate !== date) continue;
    activities.push({
      id,
      date: activityDate,
      name: asString(record.name) ?? asString(record.title) ?? null,
    });
  }
  return activities;
}

export async function fetchActivityStats(activityId: string): Promise<unknown> {
  return catapultPost("/api/v6/stats", {
    group_by: ["athlete"],
    filters: [
      {
        name: "activity_id",
        comparison: "=",
        values: [activityId],
      },
    ],
    parameters: [
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
    ],
    requested_only: false,
  });
}

export async function fetchActivityStatsBatch(activityIds: string[]): Promise<unknown> {
  const ids = activityIds.map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return [];
  const payloads = await Promise.all(ids.map((id) => fetchActivityStats(id)));
  return payloads.flatMap((payload) => (Array.isArray(payload) ? payload : [payload]));
}

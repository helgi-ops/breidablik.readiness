import "server-only";

import { resolveValdAccessToken } from "./auth";
import { valdRequestJson } from "./client";
import { getValdProductBaseUrl } from "./config";
import { inferValdProductFromPayload, mapValdAthleteSummary, mapValdTestSummary } from "./mappers";
import { normalizeForceDecksResult, normalizeForceFrameResult, normalizeNordBordResult } from "./normalizers";
import type {
  ValdAthleteSummary,
  ValdConnectionConfig,
  ValdProvider,
  ValdRegion,
  ValdTestSummary,
} from "./types";

// ── URL helpers ───────────────────────────────────────────────────────────────

/**
 * Returns the base URL for a product, preferring config.baseUrl when explicitly
 * set, then constructing a region-specific URL, then falling back to the
 * legacy generic host.
 */
function productBaseUrl(config: ValdConnectionConfig, product: "forcedecks" | "nordbord" | "forceframe"): string {
  if (config.baseUrl) return config.baseUrl;
  if (config.region) return getValdProductBaseUrl(config.region as ValdRegion, product);
  // Reasonable default — European region
  return getValdProductBaseUrl("euw", product);
}

/**
 * Athletes endpoint — returns athletes for the tenant.
 * VALD External API v2019q3: GET /v2019q3/teams/{teamId}/athletes
 *
 * The teamId path parameter corresponds to the tenant/org ID (VALD_TENANT_ID or VALD_DEFAULT_ORG_ID).
 */
function getProfilesEndpoint(config: ValdConnectionConfig): string {
  if (config.endpointOverrides?.athletes) {
    return config.endpointOverrides.athletes;
  }
  // valdTeamId = specific squad (e.g. men's team); tenantId = whole org fallback
  const squadId = config.valdTeamId ?? config.tenantId ?? config.orgId;
  const base = productBaseUrl(config, "forcedecks");
  if (squadId) {
    return new URL(`/v2019q3/teams/${encodeURIComponent(squadId)}/athletes`, base).toString();
  }
  return new URL("/profiles", base).toString();
}

/**
 * Tests base endpoint — VALD ForceDecks cursor-paginated test listing.
 * VALD External API: GET /tests?TenantId={tenantId}&ModifiedFromUtc={cursor}
 *
 * Note: VALD uses PascalCase query parameters (TenantId, ModifiedFromUtc).
 * Returns the base URL without query params so callers can add pagination args.
 */
function getTestsBaseUrl(config: ValdConnectionConfig): string {
  if (config.endpointOverrides?.tests) return config.endpointOverrides.tests;
  return new URL("/tests", productBaseUrl(config, "forcedecks")).toString();
}

/**
 * Per-athlete tests endpoint.
 * VALD External API v2019q3: GET /v2019q3/teams/{teamId}/athletes/{athleteId}/tests
 * Falls back to cursor endpoint with ProfileId filter if no tenantId is available.
 */
function getAthleteTestsUrl(config: ValdConnectionConfig, athleteId: string): string {
  if (config.endpointOverrides?.athleteTests) return config.endpointOverrides.athleteTests;
  const squadId = config.valdTeamId ?? config.tenantId ?? config.orgId;
  const base = productBaseUrl(config, "forcedecks");
  if (squadId) {
    return new URL(
      `/v2019q3/teams/${encodeURIComponent(squadId)}/athletes/${encodeURIComponent(athleteId)}/tests`,
      base,
    ).toString();
  }
  // Fallback: cursor endpoint with ProfileId filter
  const url = new URL("/tests", base);
  url.searchParams.set("ProfileId", athleteId);
  return url.toString();
}

// ── Pagination helpers ────────────────────────────────────────────────────────

function listFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["data", "items", "results", "profiles", "athletes", "tests"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  return [];
}

/**
 * Fetches all tests from the ForceDecks `/tests` endpoint using cursor
 * pagination keyed on `modifiedFromUtc`.
 *
 * Pagination continues until:
 *   - The API returns 204 No Content (valdRequestJson returns null)
 *   - The response contains an empty array
 *   - The last `modifiedDateUtc` cursor does not advance
 */
async function fetchAllTestsWithCursor(
  baseTestsUrl: string,
  tenantId: string | null | undefined,
  startCursor: string,
  headers: Record<string, string>,
  timeoutMs: number | undefined,
): Promise<unknown[]> {
  const all: unknown[] = [];
  let cursor = startCursor;
  const seen = new Set<string>();

  for (let page = 0; page < 500; page += 1) {
    const url = new URL(baseTestsUrl);
    // VALD External API uses PascalCase query parameters
    if (tenantId) url.searchParams.set("TenantId", tenantId);
    url.searchParams.set("ModifiedFromUtc", cursor);

    const payload = await valdRequestJson<unknown>(url.toString(), { headers, timeoutMs });

    // 204 No Content or empty response → done
    if (payload == null) break;

    const batch = listFromPayload(payload);
    if (batch.length === 0) break;

    let newCursor: string | null = null;
    for (const item of batch) {
      const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
      // Deduplicate by id (VALD External API TestDTO uses "id", not "testId")
      const testId = typeof rec?.id === "string" ? rec.id : typeof rec?.testId === "string" ? rec.testId : null;
      if (testId && seen.has(testId)) continue;
      if (testId) seen.add(testId);
      all.push(item);
      // Track the latest lastModifiedUTC as the next cursor (VALD External API field)
      const mod = typeof rec?.lastModifiedUTC === "string" ? rec.lastModifiedUTC
        : typeof rec?.modifiedDateUtc === "string" ? rec.modifiedDateUtc : null;
      if (mod && (!newCursor || mod > newCursor)) newCursor = mod;
    }

    // If cursor did not advance, stop to avoid infinite loops
    if (!newCursor || newCursor <= cursor) break;
    cursor = newCursor;
  }

  return all;
}

// ── Provider factory ──────────────────────────────────────────────────────────

export function createValdProvider(config: ValdConnectionConfig): ValdProvider {
  const tenantId = config.tenantId ?? config.orgId;

  async function authHeaders(): Promise<Record<string, string>> {
    const resolved = await resolveValdAccessToken(config);
    if (resolved.authMode === "api_key" && resolved.apiKey) {
      return {
        "x-api-key": resolved.apiKey,
        ...(tenantId ? { "x-org-id": tenantId } : {}),
      };
    }
    if (resolved.authMode === "oauth" && resolved.accessToken) {
      return {
        authorization: `Bearer ${resolved.accessToken}`,
        ...(tenantId ? { "x-org-id": tenantId } : {}),
      };
    }
    return config.defaultHeaders ?? {};
  }

  return {
    async testConnection() {
      const headers = await authHeaders();
      const payload = await valdRequestJson(getProfilesEndpoint(config), { headers, timeoutMs: config.timeoutMs });
      return { ok: true, diagnostics: { profilesSeen: listFromPayload(payload).length } };
    },

    async fetchAthletes(): Promise<ValdAthleteSummary[]> {
      const payload = await valdRequestJson(getProfilesEndpoint(config), {
        headers: await authHeaders(),
        timeoutMs: config.timeoutMs,
      });
      return listFromPayload(payload)
        .map(mapValdAthleteSummary)
        .filter((item): item is ValdAthleteSummary => !!item);
    },

    async fetchTestsByDateRange(dateFrom: string, _dateTo: string): Promise<ValdTestSummary[]> {
      // VALD ForceDecks API uses cursor pagination via modifiedFromUtc.
      // dateTo is not a supported parameter — we filter client-side if needed.
      const headers = await authHeaders();
      const rawTests = await fetchAllTestsWithCursor(
        getTestsBaseUrl(config),
        tenantId,
        dateFrom,
        headers,
        config.timeoutMs,
      );
      return rawTests.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
    },

    async fetchTestsForAthlete(valdAthleteId: string, dateFrom: string, _dateTo: string): Promise<ValdTestSummary[]> {
      const url = new URL(getAthleteTestsUrl(config, valdAthleteId));
      // Versioned endpoint uses modifiedFrom; cursor endpoint uses ModifiedFromUtc
      url.searchParams.set("modifiedFrom", dateFrom);
      const payload = await valdRequestJson(url.toString(), {
        headers: await authHeaders(),
        timeoutMs: config.timeoutMs,
      });
      if (payload == null) return [];
      return listFromPayload(payload)
        .map(mapValdTestSummary)
        .filter((item): item is ValdTestSummary => !!item);
    },

    async normalizeRawTest(payload) {
      const product = inferValdProductFromPayload(payload);
      if (product === "forcedecks") return normalizeForceDecksResult(payload);
      if (product === "nordbord") return normalizeNordBordResult(payload);
      if (product === "forceframe") return normalizeForceFrameResult(payload);
      return null;
    },

    getProductFromPayload(payload) {
      return inferValdProductFromPayload(payload);
    },
  };
}

export { getProfilesEndpoint, getTestsBaseUrl, getAthleteTestsUrl };

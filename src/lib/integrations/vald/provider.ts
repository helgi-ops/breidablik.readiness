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

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}

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

function getScopedAthletesEndpoint(config: ValdConnectionConfig, scopeId: string): string {
  const base = productBaseUrl(config, "forcedecks");
  return new URL(`/v2019q3/teams/${encodeURIComponent(scopeId)}/athletes`, base).toString();
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
 * Per-athlete tests base endpoint.
 * VALD External API v2019q3: GET /v2019q3/teams/{teamId}/athlete/{athleteId}/tests/{page}
 * Note: "athlete" is singular in the path (not "athletes").
 * Falls back to cursor endpoint with ProfileId filter if no squadId is available.
 */
function getAthleteTestsUrl(config: ValdConnectionConfig, athleteId: string): string {
  if (config.endpointOverrides?.athleteTests) return config.endpointOverrides.athleteTests;
  const squadId = config.valdTeamId ?? config.tenantId ?? config.orgId;
  const base = productBaseUrl(config, "forcedecks");
  if (squadId) {
    // Return page-1 URL; callers can increment {page} themselves for pagination
    return new URL(
      `/v2019q3/teams/${encodeURIComponent(squadId)}/athlete/${encodeURIComponent(athleteId)}/tests/1`,
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
  const scopeIds = uniqueNonEmpty([config.valdTeamId, config.tenantId, config.orgId]);
  const diagnostics: string[] = [];

  function note(message: string) {
    diagnostics.push(message);
  }

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
      const url = getProfilesEndpoint(config);
      note(`testConnection: ${url}`);
      const payload = await valdRequestJson(url, { headers, timeoutMs: config.timeoutMs });
      return { ok: true, diagnostics: { profilesSeen: listFromPayload(payload).length } };
    },

    async fetchAthletes(): Promise<ValdAthleteSummary[]> {
      const headers = await authHeaders();
      for (const scopeId of scopeIds) {
        const url = getScopedAthletesEndpoint(config, scopeId);
        note(`fetchAthletes scope=${scopeId}: ${url}`);
        try {
          const payload = await valdRequestJson(url, {
            headers,
            timeoutMs: config.timeoutMs,
          });
          const athletes = listFromPayload(payload)
            .map(mapValdAthleteSummary)
            .filter((item): item is ValdAthleteSummary => !!item);
          if (athletes.length > 0) {
            note(`fetchAthletes scope=${scopeId}: ${athletes.length} athletes`);
            return athletes;
          }
          note(`fetchAthletes scope=${scopeId}: 0 athletes`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          note(`fetchAthletes scope=${scopeId}: error ${msg}`);
          if (!msg.includes("404")) throw err;
        }
      }

      const fallbackUrl = getProfilesEndpoint(config);
      note(`fetchAthletes fallback: ${fallbackUrl}`);
      const payload = await valdRequestJson(fallbackUrl, {
        headers,
        timeoutMs: config.timeoutMs,
      });
      const athletes = listFromPayload(payload)
        .map(mapValdAthleteSummary)
        .filter((item): item is ValdAthleteSummary => !!item);
      note(`fetchAthletes fallback: ${athletes.length} athletes`);
      return athletes;
    },

    async fetchTestsByDateRange(dateFrom: string, dateTo: string): Promise<ValdTestSummary[]> {
      // VALD External API v2019q3 endpoints (from Swagger):
      //   GET /v2019q3/teams/{teamId}/tests/detailed/{dateFrom}/{dateTo}  ← full data with params
      //   GET /v2019q3/teams/{teamId}/tests/{dateFrom}/{dateTo}/{page}    ← paginated, dates in PATH
      //   GET /tests?TenantId=...&ModifiedFromUtc=...                     ← legacy cursor fallback
      const headers = await authHeaders();
      const base = productBaseUrl(config, "forcedecks");
      for (const scopeId of scopeIds) {
        // 1. Try detailed endpoint first — returns full test objects with param/extParams fields
        try {
          const detailedUrl = new URL(
            `/v2019q3/teams/${encodeURIComponent(scopeId)}/tests/detailed/${encodeURIComponent(dateFrom)}/${encodeURIComponent(dateTo)}`,
            base,
          );
          note(`fetchTestsByDateRange scope=${scopeId} detailed: ${detailedUrl.toString()}`);
          const payload = await valdRequestJson<unknown>(detailedUrl.toString(), { headers, timeoutMs: config.timeoutMs });
          if (payload != null) {
            const batch = listFromPayload(payload);
            if (batch.length > 0) {
              note(`fetchTestsByDateRange scope=${scopeId} detailed: ${batch.length} tests`);
              return batch.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
            }
            note(`fetchTestsByDateRange scope=${scopeId} detailed: 0 tests`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          note(`fetchTestsByDateRange scope=${scopeId} detailed: error ${msg}`);
          // 404 = endpoint unavailable, 400 = date range too large/unsupported — fall through to paginated
          if (!msg.includes("404") && !msg.includes("400")) throw err;
        }

        // 2. Paginated date-range endpoint — dates in PATH, page increments
        const all: unknown[] = [];
        for (let page = 1; page <= 500; page += 1) {
          const url = new URL(
            `/v2019q3/teams/${encodeURIComponent(scopeId)}/tests/${encodeURIComponent(dateFrom)}/${encodeURIComponent(dateTo)}/${page}`,
            base,
          );
          if (page <= 3) {
            note(`fetchTestsByDateRange scope=${scopeId} page=${page}: ${url.toString()}`);
          }
          try {
            const payload = await valdRequestJson<unknown>(url.toString(), { headers, timeoutMs: config.timeoutMs });
            if (payload == null) break;
            const batch = listFromPayload(payload);
            if (batch.length === 0) break;
            all.push(...batch);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            note(`fetchTestsByDateRange scope=${scopeId} page=${page}: error ${msg}`);
            // 404 = no more pages, 400 = invalid range — stop pagination, fall through to cursor
            if (msg.includes("404") || msg.includes("400")) break;
            throw err;
          }
        }
        if (all.length > 0) {
          note(`fetchTestsByDateRange scope=${scopeId} paged: ${all.length} tests`);
          return all.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
        }
        note(`fetchTestsByDateRange scope=${scopeId} paged: 0 tests`);
      }

      // 3. Fallback: legacy cursor-based endpoint (returns tests WITHOUT parameters)
      note(`fetchTestsByDateRange fallback: ${getTestsBaseUrl(config)} tenant=${tenantId ?? "none"} modifiedFrom=${dateFrom}`);
      const rawTests = await fetchAllTestsWithCursor(
        getTestsBaseUrl(config),
        tenantId,
        dateFrom,
        headers,
        config.timeoutMs,
      );
      note(`fetchTestsByDateRange fallback: ${rawTests.length} tests`);
      return rawTests.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
    },

    async fetchTestsForAthlete(valdAthleteId: string, dateFrom: string, _dateTo: string): Promise<ValdTestSummary[]> {
      // VALD External API v2019q3: GET /v2019q3/teams/{teamId}/athlete/{athleteId}/tests/{page}
      // Note: "athlete" is singular in the path (Swagger-confirmed).
      const headers = await authHeaders();
      const base = productBaseUrl(config, "forcedecks");
      for (const scopeId of scopeIds) {
        const all: unknown[] = [];
        for (let page = 1; page <= 500; page += 1) {
          const url = new URL(
            `/v2019q3/teams/${encodeURIComponent(scopeId)}/athlete/${encodeURIComponent(valdAthleteId)}/tests/${page}`,
            base,
          );
          url.searchParams.set("modifiedFrom", dateFrom);
          if (page <= 3) {
            note(`fetchTestsForAthlete scope=${scopeId} athlete=${valdAthleteId} page=${page}: ${url.toString()}`);
          }
          try {
            const payload = await valdRequestJson<unknown>(url.toString(), { headers, timeoutMs: config.timeoutMs });
            if (payload == null) break;
            const batch = listFromPayload(payload);
            if (batch.length === 0) break;
            all.push(...batch);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            note(`fetchTestsForAthlete scope=${scopeId} athlete=${valdAthleteId} page=${page}: error ${msg}`);
            if (msg.includes("404") || msg.includes("400")) break;
            throw err;
          }
        }
        if (all.length > 0) {
          note(`fetchTestsForAthlete scope=${scopeId} athlete=${valdAthleteId}: ${all.length} tests`);
          return all.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
        }
        note(`fetchTestsForAthlete scope=${scopeId} athlete=${valdAthleteId}: 0 tests`);
      }

      // Fallback: cursor endpoint filtered by ProfileId
      const fallbackUrl = new URL(getTestsBaseUrl(config));
      if (tenantId) fallbackUrl.searchParams.set("TenantId", tenantId);
      fallbackUrl.searchParams.set("ProfileId", valdAthleteId);
      fallbackUrl.searchParams.set("ModifiedFromUtc", dateFrom);
      note(`fetchTestsForAthlete fallback athlete=${valdAthleteId}: ${fallbackUrl.toString()}`);
      const payload = await valdRequestJson(fallbackUrl.toString(), { headers, timeoutMs: config.timeoutMs });
      if (payload == null) return [];
      const tests = listFromPayload(payload)
        .map(mapValdTestSummary)
        .filter((item): item is ValdTestSummary => !!item);
      note(`fetchTestsForAthlete fallback athlete=${valdAthleteId}: ${tests.length} tests`);
      return tests;
    },

    getDiagnostics() {
      return diagnostics.slice(-60);
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

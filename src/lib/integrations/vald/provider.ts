import "server-only";

import { resolveValdAccessToken } from "./auth";
import { valdRequestJson } from "./client";
import { getValdProductBaseUrl } from "./config";
import { inferValdProductFromPayload, mapValdAthleteSummary, mapValdTestSummary } from "./mappers";
import { normalizeForceDecksResult, normalizeForceDecksTrials, normalizeForceFrameResult, normalizeNordBordResult } from "./normalizers";
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

  /**
   * Per-product implementation of fetchTestsByDateRange. Same detailed →
   * paged → cursor fallback chain as before, but parameterised by product so
   * the public method can call it for ForceDecks, ForceFrame, and Nordbord
   * in turn against their respective base URLs.
   */
  async function fetchTestsByDateRangeForProductImpl(
    product: "forcedecks" | "forceframe" | "nordbord",
    dateFrom: string,
    dateTo: string,
    headers: Record<string, string>,
  ): Promise<ValdTestSummary[]> {
    const base = productBaseUrl(config, product);
    for (const scopeId of scopeIds) {
      // 1. Detailed endpoint — full test objects with param/extParams fields
      try {
        const detailedUrl = new URL(
          `/v2019q3/teams/${encodeURIComponent(scopeId)}/tests/detailed/${encodeURIComponent(dateFrom)}/${encodeURIComponent(dateTo)}`,
          base,
        );
        note(`fetchTests[${product}] scope=${scopeId} detailed: ${detailedUrl.toString()}`);
        const payload = await valdRequestJson<unknown>(detailedUrl.toString(), { headers, timeoutMs: config.timeoutMs });
        if (payload != null) {
          const batch = listFromPayload(payload);
          if (batch.length > 0) {
            note(`fetchTests[${product}] scope=${scopeId} detailed: ${batch.length} tests`);
            return batch.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
          }
          note(`fetchTests[${product}] scope=${scopeId} detailed: 0 tests`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isAbort = err instanceof Error && err.name === "AbortError";
        note(`fetchTests[${product}] scope=${scopeId} detailed: error ${msg}`);
        if (!msg.includes("404") && !msg.includes("400") && !isAbort) throw err;
      }

      // 2. Paginated date-range endpoint
      const all: unknown[] = [];
      for (let page = 1; page <= 500; page += 1) {
        const url = new URL(
          `/v2019q3/teams/${encodeURIComponent(scopeId)}/tests/${encodeURIComponent(dateFrom)}/${encodeURIComponent(dateTo)}/${page}`,
          base,
        );
        if (page <= 3) note(`fetchTests[${product}] scope=${scopeId} page=${page}: ${url.toString()}`);
        try {
          const payload = await valdRequestJson<unknown>(url.toString(), { headers, timeoutMs: config.timeoutMs });
          if (payload == null) break;
          const batch = listFromPayload(payload);
          if (batch.length === 0) break;
          all.push(...batch);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const isAbort = err instanceof Error && err.name === "AbortError";
          note(`fetchTests[${product}] scope=${scopeId} page=${page}: error ${msg}`);
          if (msg.includes("404") || msg.includes("400") || isAbort) break;
          throw err;
        }
      }
      if (all.length > 0) {
        note(`fetchTests[${product}] scope=${scopeId} paged: ${all.length} tests`);
        return all.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
      }
      note(`fetchTests[${product}] scope=${scopeId} paged: 0 tests`);
    }

    // 3. Cursor fallback — tests without parameters but enough for inference
    const cursorBase = new URL("/tests", productBaseUrl(config, product)).toString();
    note(`fetchTests[${product}] cursor-fallback: ${cursorBase} tenant=${tenantId ?? "none"} modifiedFrom=${dateFrom}`);
    const rawTests = await fetchAllTestsWithCursor(cursorBase, tenantId, dateFrom, headers, config.timeoutMs);
    note(`fetchTests[${product}] cursor-fallback: ${rawTests.length} tests`);
    return rawTests.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
  }

  /** Per-product implementation of fetchTestsForAthlete. */
  async function fetchTestsForAthleteForProductImpl(
    product: "forcedecks" | "forceframe" | "nordbord",
    valdAthleteId: string,
    dateFrom: string,
    headers: Record<string, string>,
  ): Promise<ValdTestSummary[]> {
    const base = productBaseUrl(config, product);
    for (const scopeId of scopeIds) {
      const all: unknown[] = [];
      for (let page = 1; page <= 500; page += 1) {
        const url = new URL(
          `/v2019q3/teams/${encodeURIComponent(scopeId)}/athlete/${encodeURIComponent(valdAthleteId)}/tests/${page}`,
          base,
        );
        url.searchParams.set("modifiedFrom", dateFrom);
        if (page <= 3) note(`fetchTestsForAthlete[${product}] scope=${scopeId} athlete=${valdAthleteId} page=${page}: ${url.toString()}`);
        try {
          const payload = await valdRequestJson<unknown>(url.toString(), { headers, timeoutMs: config.timeoutMs });
          if (payload == null) break;
          const batch = listFromPayload(payload);
          if (batch.length === 0) break;
          all.push(...batch);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          note(`fetchTestsForAthlete[${product}] scope=${scopeId} athlete=${valdAthleteId} page=${page}: error ${msg}`);
          if (msg.includes("404") || msg.includes("400")) break;
          throw err;
        }
      }
      if (all.length > 0) {
        note(`fetchTestsForAthlete[${product}] scope=${scopeId} athlete=${valdAthleteId}: ${all.length} tests`);
        return all.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
      }
      note(`fetchTestsForAthlete[${product}] scope=${scopeId} athlete=${valdAthleteId}: 0 tests`);
    }

    // Cursor fallback filtered by ProfileId
    const cursorUrl = new URL("/tests", productBaseUrl(config, product));
    if (tenantId) cursorUrl.searchParams.set("TenantId", tenantId);
    cursorUrl.searchParams.set("ProfileId", valdAthleteId);
    cursorUrl.searchParams.set("ModifiedFromUtc", dateFrom);
    note(`fetchTestsForAthlete[${product}] cursor-fallback athlete=${valdAthleteId}: ${cursorUrl.toString()}`);
    const payload = await valdRequestJson(cursorUrl.toString(), { headers, timeoutMs: config.timeoutMs });
    if (payload == null) return [];
    const tests = listFromPayload(payload).map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
    note(`fetchTestsForAthlete[${product}] cursor-fallback athlete=${valdAthleteId}: ${tests.length} tests`);
    return tests;
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
      // Multi-product fetch: VALD has 3 product endpoints (ForceDecks/CMJ,
      // ForceFrame/groin, Nordbord/hamstring), each on its own base URL but
      // sharing the v2019q3 path structure. Loop over all 3 so we get every
      // test type the org runs. Tag each result with the source product so
      // sync.ts normalization picks the right schema downstream.
      //
      // Before this change the sync only hit ForceDecks → ForceFrame and
      // Nordbord tables stayed empty regardless of how many tests the team
      // ran in VALD HUB.
      const headers = await authHeaders();
      const products: Array<"forcedecks" | "forceframe" | "nordbord"> = ["forcedecks", "forceframe", "nordbord"];
      const allTests: ValdTestSummary[] = [];
      for (const product of products) {
        const productTests = await fetchTestsByDateRangeForProductImpl(product, dateFrom, dateTo, headers);
        // Endpoint origin is more reliable than payload-shape inference,
        // especially for minimal payloads from the cursor fallback path.
        // Override "unknown" with the source product but keep explicit hints
        // (in case a payload was misrouted somehow).
        for (const test of productTests) {
          if (test.product === "unknown") test.product = product;
        }
        allTests.push(...productTests);
      }
      return allTests;
    },

    async fetchTestsForAthlete(valdAthleteId: string, dateFrom: string, _dateTo: string): Promise<ValdTestSummary[]> {
      // Same multi-product treatment for per-athlete backfill.
      const headers = await authHeaders();
      const products: Array<"forcedecks" | "forceframe" | "nordbord"> = ["forcedecks", "forceframe", "nordbord"];
      const allTests: ValdTestSummary[] = [];
      for (const product of products) {
        const productTests = await fetchTestsForAthleteForProductImpl(product, valdAthleteId, dateFrom, headers);
        for (const test of productTests) {
          if (test.product === "unknown") test.product = product;
        }
        allTests.push(...productTests);
      }
      return allTests;
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

    normalizeForceDecksTrials(payload) {
      return normalizeForceDecksTrials(payload);
    },

    getProductFromPayload(payload) {
      return inferValdProductFromPayload(payload);
    },
  };
}

export { getProfilesEndpoint, getTestsBaseUrl, getAthleteTestsUrl };

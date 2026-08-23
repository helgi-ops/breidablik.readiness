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
 * Returns the base URL for a product. CRITICAL that Nordbord and ForceFrame
 * resolve to their actual subdomains (`nordbord` and `groinbar` respectively),
 * NOT the same domain as ForceDecks. Verified by DevTools probe in VALD HUB.
 *
 * For ForceDecks, we still respect config.baseUrl (so per-team overrides work)
 * because ForceDecks has its own legacy `extforcedecks` host.
 *
 * For Nordbord/ForceFrame, we IGNORE config.baseUrl entirely and always use
 * the canonical region-specific URL — config.baseUrl is invariably the
 * ForceDecks host (set when the account was first configured), and using it
 * for Nordbord/ForceFrame would silently route all 3 products to ForceDecks
 * (the bug we just fixed).
 */
function productBaseUrl(config: ValdConnectionConfig, product: "forcedecks" | "nordbord" | "forceframe"): string {
  if (product === "forcedecks") {
    if (config.baseUrl) return config.baseUrl;
    if (config.region) return getValdProductBaseUrl(config.region as ValdRegion, "forcedecks");
    return getValdProductBaseUrl("euw", "forcedecks");
  }
  // Nordbord / ForceFrame — always canonical product URL, never config.baseUrl
  if (config.region) return getValdProductBaseUrl(config.region as ValdRegion, product);
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
 * Extracts the trials array from a ForceDecks `/tests/{testId}/trials` response.
 * The endpoint returns a bare array of TrialResultDTO, but tolerate the common
 * envelope shapes ({trials}, {data}, {items}, {results}) in case VALD wraps it.
 */
function trialsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["trials", "data", "items", "results"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  return [];
}

/** Normalise a YYYY-MM-DD (or already-full ISO) day into the full UTC instant
 *  the External NordBord/ForceFrame API expects for ModifiedFromUtc. */
function toModifiedFromUtc(day: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return `${day}T00:00:00.000Z`;
  return day;
}

// NordBord / ForceFrame are PERIODIC strength tests (weeks–months apart), not the
// daily CMJ cadence — so a normal single-day sync would never see the last Nordic
// or groin test. We always back-fill a wide window for these two devices so the
// full recent history lands regardless of the sync's daily date range. Cheap: a
// squad has tens of such tests, and upserts are idempotent.
const DEVICE_BACKFILL_DAYS = 1095; // ~3 years

/** The earlier of the requested dateFrom and (dateTo − DEVICE_BACKFILL_DAYS). */
function deviceBackfillFrom(dateFrom: string, dateTo: string): string {
  const to = /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? new Date(`${dateTo}T00:00:00.000Z`) : new Date(dateTo);
  const wide = new Date(to.getTime() - DEVICE_BACKFILL_DAYS * 86400000).toISOString().slice(0, 10);
  return dateFrom < wide ? dateFrom : wide;
}

/**
 * Fetches all NordBord / ForceFrame tests from the modern External API using
 * the documented `/tests/v2` cursor endpoint (support.vald.com, confirmed
 * 23 Aug 2026):
 *
 *   GET /tests/v2?TenantId={tenantId}&ModifiedFromUtc={iso}[&ProfileId={id}]
 *
 * Response is `{ tests: [...] }` in ASCENDING modifiedDateUtc order. To page,
 * resend with ModifiedFromUtc = the last record's `modifiedDateUtc`, until a
 * 204 No Content (null payload) or an empty page is returned. tenantId is a
 * QUERY parameter — there is NO team path segment (unlike ForceDecks v2019q3).
 */
async function fetchAllTestsV2Cursor(
  base: string,
  tenantId: string | null | undefined,
  startCursor: string,
  headers: Record<string, string>,
  timeoutMs: number | undefined,
  profileId: string | null | undefined,
  note: (m: string) => void,
): Promise<unknown[]> {
  const all: unknown[] = [];
  const seen = new Set<string>();
  let cursor = toModifiedFromUtc(startCursor);

  for (let page = 0; page < 500; page += 1) {
    const url = new URL("/tests/v2", base);
    if (tenantId) url.searchParams.set("TenantId", tenantId);
    url.searchParams.set("ModifiedFromUtc", cursor);
    if (profileId) url.searchParams.set("ProfileId", profileId);
    if (page < 2) note(`tests/v2 cursor page=${page}: ${url.toString()}`);

    const payload = await valdRequestJson<unknown>(url.toString(), { headers, timeoutMs });
    if (payload == null) break; // 204 No Content → done

    const batch = listFromPayload(payload); // unwraps { tests: [...] }
    if (batch.length === 0) break;

    let newCursor: string | null = null;
    let added = 0;
    for (const item of batch) {
      const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
      const testId = typeof rec?.testId === "string" ? rec.testId : typeof rec?.id === "string" ? rec.id : null;
      if (testId && seen.has(testId)) continue;
      if (testId) seen.add(testId);
      all.push(item);
      added += 1;
      const mod = typeof rec?.modifiedDateUtc === "string" ? rec.modifiedDateUtc
        : typeof rec?.modifiedUtc === "string" ? rec.modifiedUtc : null;
      if (mod && (!newCursor || mod > newCursor)) newCursor = mod;
    }
    // Stop if the cursor can't advance (all-dup page or missing timestamps) to
    // avoid re-requesting the same window forever.
    if (added === 0 || !newCursor || newCursor <= cursor) break;
    cursor = newCursor;
  }

  return all;
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
   * Enriches ForceDecks tests with the FULL per-trial result set.
   *
   * The `/tests/detailed/{from}/{to}` listing (and the paged fallback) embeds
   * only a THIN `trials[].results[]` — ~4 summary metrics (jump height, mean
   * forces, peak power). RSI-modified, time-to-takeoff, phase durations and
   * impulses are NOT in that summary. The complete result set lives on the
   * per-test trials endpoint (verified against VALD's External ForceDecks API
   * docs, 2026-07-22):
   *
   *   GET /v2019q3/teams/{scopeId}/tests/{testId}/trials  →  TrialResultDTO[]
   *
   * which returns the SAME `trials[].results[]` shape the normalizer already
   * consumes (each result carries { value, limb, definition: { result, unit } }).
   * We replace the thin embedded trials with the full ones so RSI-modified flows
   * through with no further code change — and the stored raw payload keeps them.
   *
   * Fail-safe: any error (404/403/timeout) or empty response leaves the embedded
   * summary trials intact, so the sync never regresses — the CMJ diagnostic in
   * sync.ts then simply reports RSI as still MISSING, which is honest.
   */
  async function enrichForceDecksTrials(
    tests: ValdTestSummary[],
    scopeId: string,
    base: string,
    headers: Record<string, string>,
  ): Promise<void> {
    let enriched = 0;
    let failed = 0;
    for (const test of tests) {
      const rawRec = test.raw && typeof test.raw === "object" ? (test.raw as Record<string, unknown>) : null;
      if (!rawRec || !test.testId) continue;
      try {
        const url = new URL(
          `/v2019q3/teams/${encodeURIComponent(scopeId)}/tests/${encodeURIComponent(test.testId)}/trials`,
          base,
        );
        const payload = await valdRequestJson<unknown>(url.toString(), { headers, timeoutMs: config.timeoutMs });
        const fullTrials = trialsFromPayload(payload);
        if (fullTrials.length > 0) {
          rawRec.trials = fullTrials;
          enriched += 1;
        }
      } catch (err) {
        failed += 1;
        // Keep the embedded thin trials — one bad test can't break the batch.
        if (failed <= 2) {
          const msg = err instanceof Error ? err.message : String(err);
          note(`fetchTests[forcedecks] trials-enrich testId=${test.testId}: error ${msg}`);
        }
      }
    }
    note(
      `fetchTests[forcedecks] trials-enrich scope=${scopeId}: ${enriched}/${tests.length} tests pulled the full result set` +
        (failed ? `, ${failed} fell back to the summary set` : ""),
    );
  }

  /**
   * Per-product implementation of fetchTestsByDateRange. ForceDecks uses
   * the v2019q3 path with embedded date range; Nordbord and ForceFrame
   * use modern endpoints that return all team tests (we filter by date
   * client-side in sync.ts).
   *
   * Path templates verified by DevTools probe in VALD HUB:
   *   - ForceDecks: /v2019q3/teams/{scopeId}/tests/detailed/{from}/{to}
   *   - Nordbord:   /teams/{scopeId}/tests/all
   *   - ForceFrame: /summaries/team/{scopeId}/tests
   */
  async function fetchTestsByDateRangeForProductImpl(
    product: "forcedecks" | "forceframe" | "nordbord",
    dateFrom: string,
    dateTo: string,
    headers: Record<string, string>,
  ): Promise<ValdTestSummary[]> {
    const base = productBaseUrl(config, product);

    // NordBord and ForceFrame use the documented modern External API:
    //   GET /tests/v2?TenantId={tenantId}&ModifiedFromUtc={iso}
    // (support.vald.com guides, confirmed 23 Aug 2026). tenantId is a QUERY
    // parameter and there is NO team path — so we page with the shared cursor
    // helper and filter to the requested test-date window client-side, because
    // /tests/v2 filters on MODIFIED date, not test date.
    if (product === "nordbord" || product === "forceframe") {
      const wideFrom = deviceBackfillFrom(dateFrom, dateTo);
      const raw = await fetchAllTestsV2Cursor(base, tenantId, wideFrom, headers, config.timeoutMs, null, note);
      const inRange = raw.filter((row) => {
        const rec = row as Record<string, unknown>;
        const ts = (rec.testDateUtc ?? rec.testDate ?? rec.modifiedDateUtc) as string | undefined;
        if (!ts) return true; // keep if no timestamp — better safe than dropping
        const day = ts.slice(0, 10);
        return day >= wideFrom && day <= dateTo;
      });
      note(`fetchTests[${product}] tests/v2: ${raw.length} fetched, ${inRange.length} in [${wideFrom}..${dateTo}] (device back-fill)`);
      return inRange.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
    }

    // ForceDecks legacy v2019q3 path with detailed → paged → cursor fallback
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
            const summaries = batch.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
            if (product === "forcedecks") await enrichForceDecksTrials(summaries, scopeId, base, headers);
            return summaries;
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
        const summaries = all.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
        if (product === "forcedecks") await enrichForceDecksTrials(summaries, scopeId, base, headers);
        return summaries;
      }
      note(`fetchTests[${product}] scope=${scopeId} paged: 0 tests`);
    }

    // 3. Cursor fallback — tests without parameters but enough for inference.
    // Wrapped in try/catch so DNS / connection failures on the legacy /tests
    // path return [] instead of bubbling up. The outer fetchTestsByDateRange
    // also catches but this gives cleaner per-product noting.
    try {
      const cursorBase = new URL("/tests", productBaseUrl(config, product)).toString();
      note(`fetchTests[${product}] cursor-fallback: ${cursorBase} tenant=${tenantId ?? "none"} modifiedFrom=${dateFrom}`);
      const rawTests = await fetchAllTestsWithCursor(cursorBase, tenantId, dateFrom, headers, config.timeoutMs);
      note(`fetchTests[${product}] cursor-fallback: ${rawTests.length} tests`);
      return rawTests.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      note(`fetchTests[${product}] cursor-fallback failed: ${msg}`);
      return [];
    }
  }

  /** Per-product implementation of fetchTestsForAthlete. */
  async function fetchTestsForAthleteForProductImpl(
    product: "forcedecks" | "forceframe" | "nordbord",
    valdAthleteId: string,
    dateFrom: string,
    headers: Record<string, string>,
  ): Promise<ValdTestSummary[]> {
    const base = productBaseUrl(config, product);

    // NordBord / ForceFrame — modern External API, ProfileId filter on /tests/v2.
    if (product === "nordbord" || product === "forceframe") {
      const raw = await fetchAllTestsV2Cursor(base, tenantId, dateFrom, headers, config.timeoutMs, valdAthleteId, note);
      note(`fetchTestsForAthlete[${product}] tests/v2 athlete=${valdAthleteId}: ${raw.length} tests`);
      return raw.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
    }

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
        const summaries = all.map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
        if (product === "forcedecks") await enrichForceDecksTrials(summaries, scopeId, base, headers);
        return summaries;
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
      // Multi-product fetch: try ForceDecks (proven to work), then ForceFrame
      // and Nordbord (subdomains may not exist for this org). Each product is
      // wrapped in try/catch so a network error against one endpoint can't
      // kill the whole sync — ForceDecks data still flows even if ForceFrame
      // is unreachable. Once VALD confirms the correct subdomains for
      // ForceFrame/Nordbord, the unreachability errors will disappear.
      const headers = await authHeaders();
      const products: Array<"forcedecks" | "forceframe" | "nordbord"> = ["forcedecks", "forceframe", "nordbord"];
      const allTests: ValdTestSummary[] = [];
      for (const product of products) {
        try {
          const productTests = await fetchTestsByDateRangeForProductImpl(product, dateFrom, dateTo, headers);
          for (const test of productTests) {
            if (test.product === "unknown") test.product = product;
          }
          allTests.push(...productTests);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          note(`fetchTests[${product}] FAILED: ${msg} — likely subdomain not accessible for this org. Continuing with other products.`);
        }
      }
      return allTests;
    },

    async fetchTestsForAthlete(valdAthleteId: string, dateFrom: string, _dateTo: string): Promise<ValdTestSummary[]> {
      // Same fail-gracefully treatment for per-athlete backfill.
      const headers = await authHeaders();
      const products: Array<"forcedecks" | "forceframe" | "nordbord"> = ["forcedecks", "forceframe", "nordbord"];
      const allTests: ValdTestSummary[] = [];
      for (const product of products) {
        try {
          const productTests = await fetchTestsForAthleteForProductImpl(product, valdAthleteId, dateFrom, headers);
          for (const test of productTests) {
            if (test.product === "unknown") test.product = product;
          }
          allTests.push(...productTests);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          note(`fetchTestsForAthlete[${product}] FAILED: ${msg} — likely subdomain not accessible for this org.`);
        }
      }
      return allTests;
    },

    async fetchTestMetrics(product: "nordbord" | "forceframe", testId: string): Promise<unknown | null> {
      try {
        const headers = await authHeaders();
        const base = productBaseUrl(config, product);
        const url = new URL(`/tests/${encodeURIComponent(testId)}/metrics`, base);
        if (tenantId) url.searchParams.set("TenantId", tenantId);
        const payload = await valdRequestJson<unknown>(url.toString(), { headers, timeoutMs: config.timeoutMs });
        return payload ?? null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        note(`fetchTestMetrics[${product}] testId=${testId}: error ${msg}`);
        return null; // fail-safe — the summary row is already stored
      }
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

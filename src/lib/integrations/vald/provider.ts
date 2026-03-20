import "server-only";

import { resolveValdAccessToken } from "./auth";
import { valdRequestJson } from "./client";
import { inferValdProductFromPayload, mapValdAthleteSummary, mapValdTestSummary } from "./mappers";
import { normalizeForceDecksResult, normalizeForceFrameResult, normalizeNordBordResult } from "./normalizers";
import type {
  ValdAthleteSummary,
  ValdConnectionConfig,
  ValdProvider,
  ValdTestSummary,
} from "./types";

function getAthletesEndpoint(config: ValdConnectionConfig): string {
  return new URL(config.endpointOverrides?.athletes ?? "/v1/athletes", config.baseUrl).toString();
}

function getTestsEndpoint(config: ValdConnectionConfig): string {
  return new URL(config.endpointOverrides?.tests ?? "/v1/tests", config.baseUrl).toString();
}

function getAthleteTestsEndpoint(config: ValdConnectionConfig, athleteId: string): string {
  const path = config.endpointOverrides?.athleteTests ?? `/v1/athletes/${encodeURIComponent(athleteId)}/tests`;
  return new URL(path, config.baseUrl).toString();
}

function listFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["data", "items", "results", "athletes", "tests"]) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  return [];
}

export function createValdProvider(config: ValdConnectionConfig): ValdProvider {
  async function authHeaders(): Promise<Record<string, string>> {
    const resolved = await resolveValdAccessToken(config);
    if (resolved.authMode === "api_key" && resolved.apiKey) {
      return { "x-api-key": resolved.apiKey, ...(config.orgId ? { "x-org-id": config.orgId } : {}) };
    }
    if (resolved.authMode === "oauth" && resolved.accessToken) {
      return { authorization: `Bearer ${resolved.accessToken}`, ...(config.orgId ? { "x-org-id": config.orgId } : {}) };
    }
    return config.defaultHeaders ?? {};
  }

  return {
    async testConnection() {
      const headers = await authHeaders();
      const athletes = await valdRequestJson(getAthletesEndpoint(config), { headers, timeoutMs: config.timeoutMs });
      return { ok: true, diagnostics: { athletesSeen: listFromPayload(athletes).length } };
    },
    async fetchAthletes(): Promise<ValdAthleteSummary[]> {
      const payload = await valdRequestJson(getAthletesEndpoint(config), {
        headers: await authHeaders(),
        timeoutMs: config.timeoutMs,
      });
      return listFromPayload(payload).map(mapValdAthleteSummary).filter((item): item is ValdAthleteSummary => !!item);
    },
    async fetchTestsByDateRange(dateFrom: string, dateTo: string): Promise<ValdTestSummary[]> {
      const url = new URL(getTestsEndpoint(config));
      url.searchParams.set("dateFrom", dateFrom);
      url.searchParams.set("dateTo", dateTo);
      const payload = await valdRequestJson(url.toString(), {
        headers: await authHeaders(),
        timeoutMs: config.timeoutMs,
      });
      return listFromPayload(payload).map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
    },
    async fetchTestsForAthlete(valdAthleteId: string, dateFrom: string, dateTo: string): Promise<ValdTestSummary[]> {
      const url = new URL(getAthleteTestsEndpoint(config, valdAthleteId));
      url.searchParams.set("dateFrom", dateFrom);
      url.searchParams.set("dateTo", dateTo);
      const payload = await valdRequestJson(url.toString(), {
        headers: await authHeaders(),
        timeoutMs: config.timeoutMs,
      });
      return listFromPayload(payload).map(mapValdTestSummary).filter((item): item is ValdTestSummary => !!item);
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

export { getAthletesEndpoint, getTestsEndpoint, getAthleteTestsEndpoint };

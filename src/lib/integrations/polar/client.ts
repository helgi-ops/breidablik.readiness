import { POLAR_TEAMPRO_API_BASE } from "./config";
import type { PolarTeamSummary, PolarPlayer, PolarSession } from "./types";

/**
 * Thin HTTP wrapper for Polar Team Pro endpoints.
 * Pass an active access token; refresh logic lives in the calling code.
 *
 * NOTE: Real Polar Team Pro endpoint paths and response shapes depend on the
 * partner agreement version. The shapes here mirror the publicly documented
 * Team Pro Web Service. Adjust once you have a sandbox account.
 */

type FetchOptions = {
  accessToken: string;
  query?: Record<string, string | number | undefined>;
};

async function polarGet<T>(path: string, opts: FetchOptions): Promise<T> {
  const url = new URL(path, POLAR_TEAMPRO_API_BASE);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${opts.accessToken}`,
      "Accept": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POLAR API ${path} failed: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** List teams visible to this access token. */
export async function fetchPolarTeams(accessToken: string): Promise<PolarTeamSummary[]> {
  // Team Pro: GET /v1/teams
  const json = await polarGet<{ data?: PolarTeamSummary[] } | PolarTeamSummary[]>(
    "/v1/teams",
    { accessToken }
  );
  return Array.isArray(json) ? json : (json.data ?? []);
}

/** List players for a given team. */
export async function fetchPolarTeamPlayers(
  accessToken: string,
  teamId: string
): Promise<PolarPlayer[]> {
  const json = await polarGet<{ data?: PolarPlayer[] } | PolarPlayer[]>(
    `/v1/teams/${encodeURIComponent(teamId)}/players`,
    { accessToken }
  );
  return Array.isArray(json) ? json : (json.data ?? []);
}

/**
 * List sessions for a team within an optional date range.
 * Date params are ISO strings (yyyy-mm-dd or full ISO).
 */
export async function fetchPolarTeamSessions(
  accessToken: string,
  teamId: string,
  options: { since?: string; until?: string } = {}
): Promise<PolarSession[]> {
  const json = await polarGet<{ data?: PolarSession[] } | PolarSession[]>(
    `/v1/teams/${encodeURIComponent(teamId)}/sessions`,
    {
      accessToken,
      query: { since: options.since, until: options.until },
    }
  );
  return Array.isArray(json) ? json : (json.data ?? []);
}

/**
 * Fetch detailed per-player metrics for a single session.
 * Some endpoint variants return participants embedded in the session itself
 * (covered by fetchPolarTeamSessions). Use this when you need explicit details.
 */
export async function fetchPolarSessionDetail(
  accessToken: string,
  sessionId: string
): Promise<PolarSession> {
  return polarGet<PolarSession>(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
    accessToken,
  });
}

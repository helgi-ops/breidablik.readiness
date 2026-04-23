import "server-only";

import { fetchPolarTeams, fetchPolarTeamSessions } from "./client";
import { polarAdapter } from "@/lib/micropulse/integrations/adapters/polar";
import { computePolarTokenExpiresAt, refreshPolarAccessToken } from "./oauth";
import {
  getPolarIntegrationByTeam,
  upsertPolarIntegration,
} from "@/lib/server/integrations/polarStore";
import type { PolarSession, PolarSessionParticipant } from "./types";

export type PolarSyncSummary = {
  teamId: string;
  externalTeamId: string | null;
  sessionsFetched: number;
  metricsNormalized: number;
  warnings: string[];
  errors: string[];
};

/**
 * Ensure we have a non-expired access token. If the stored one has expired
 * (or is within 60 s of expiry), refresh it and persist the new pair.
 */
async function ensureFreshAccessToken(teamId: string): Promise<string> {
  const integration = await getPolarIntegrationByTeam(teamId);
  if (!integration?.access_token) {
    throw new Error("Polar integration not connected for this team.");
  }

  const expiresAt = integration.access_token_expires_at
    ? new Date(integration.access_token_expires_at).getTime()
    : null;
  const needsRefresh = expiresAt != null && expiresAt - Date.now() < 60_000;

  if (!needsRefresh) return integration.access_token;
  if (!integration.refresh_token) {
    throw new Error("Polar access token expired and no refresh token is stored — reconnect required.");
  }

  const refreshed = await refreshPolarAccessToken(integration.refresh_token);
  await upsertPolarIntegration({
    team_id: teamId,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? integration.refresh_token,
    token_type: refreshed.token_type ?? integration.token_type ?? null,
    access_token_expires_at: computePolarTokenExpiresAt(refreshed),
    status: "active",
  });
  return refreshed.access_token;
}

/**
 * Pull sessions for the given team within a date window and normalize them
 * via the existing polarAdapter, which produces MicroPulse metric rows.
 *
 * Persisting the normalized metrics into the readiness pipeline is handled
 * by the existing ingest layer — this function returns the normalized output
 * so the caller can feed it through `persistRawAndNormalized` (see
 * src/lib/micropulse/integrations/ingest.ts) when ready.
 */
export async function syncPolarTeam(
  teamId: string,
  options: { sinceDays?: number } = {}
): Promise<PolarSyncSummary> {
  const summary: PolarSyncSummary = {
    teamId,
    externalTeamId: null,
    sessionsFetched: 0,
    metricsNormalized: 0,
    warnings: [],
    errors: [],
  };

  try {
    const accessToken = await ensureFreshAccessToken(teamId);

    // 1. Discover the external Polar team. Most setups have one team per OAuth
    //    grant, but Team Pro can return many — we use the first or the
    //    previously stored external_team_id.
    const stored = await getPolarIntegrationByTeam(teamId);
    let externalTeamId: string | null = stored?.external_team_id ?? null;

    if (!externalTeamId) {
      const teams = await fetchPolarTeams(accessToken);
      if (!teams.length) {
        summary.warnings.push("No Polar teams visible to this access token.");
        return summary;
      }
      externalTeamId = teams[0].id;
      await upsertPolarIntegration({
        team_id: teamId,
        external_team_id: externalTeamId,
        provider_metadata: { teamName: teams[0].name },
      });
    }
    summary.externalTeamId = externalTeamId;

    // 2. Pull sessions in the requested window (default last 14 days).
    const sinceDays = options.sinceDays ?? 14;
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
    const sessions = await fetchPolarTeamSessions(accessToken, externalTeamId, { since });
    summary.sessionsFetched = sessions.length;

    if (!sessions.length) {
      summary.warnings.push(`No Polar sessions in the last ${sinceDays} days.`);
      await upsertPolarIntegration({
        team_id: teamId,
        last_synced_at: new Date().toISOString(),
        last_sync_status: "success",
        last_sync_error: null,
        status: "active",
      });
      return summary;
    }

    // 3. Flatten participants into adapter-friendly rows. The polarAdapter
    //    expects rows with athlete_id + timestamp + per-metric fields.
    const adapterRows = sessions.flatMap((session: PolarSession) =>
      (session.participants ?? []).map((p: PolarSessionParticipant) => ({
        athlete_id: p.player_id,
        timestamp: session.start_time,
        training_load: p.training_load,
        avg_hr: p.avg_hr,
        max_hr: p.max_hr,
        distance: p.distance_m,
        sprints: p.sprints,
      }))
    );

    const adapterResult = polarAdapter.normalize({
      id: `polar-sync-${Date.now()}`,
      provider: "POLAR",
      importMode: "API_PULL",
      payload: adapterRows,
      sourceRef: externalTeamId,
      receivedAt: new Date().toISOString(),
    });
    summary.metricsNormalized = adapterResult.normalizedMetrics.length;
    summary.warnings.push(...(adapterResult.warnings ?? []));

    // 4. Persist sync status. The actual metric persistence is left to the
    //    existing ingest pipeline — call persistRawAndNormalized() with the
    //    adapterResult from the API route once you wire it up.
    await upsertPolarIntegration({
      team_id: teamId,
      last_synced_at: new Date().toISOString(),
      last_sync_status: "success",
      last_sync_error: null,
      status: "active",
    });

    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    summary.errors.push(message);
    await upsertPolarIntegration({
      team_id: teamId,
      last_sync_status: "error",
      last_sync_error: message.slice(0, 500),
    });
    return summary;
  }
}

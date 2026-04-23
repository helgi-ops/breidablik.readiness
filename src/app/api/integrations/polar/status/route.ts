import { NextResponse } from "next/server";
import {
  getPolarIntegrationByTeam,
  resolveCoachTeamId,
} from "@/lib/server/integrations/polarStore";
import { resolvePolarRouteUserId } from "../_auth";

export const runtime = "nodejs";

/**
 * GET /api/integrations/polar/status
 * Returns connection status for the coach's team (or ?teamId= override).
 */
export async function GET(req: Request) {
  try {
    const userId = await resolvePolarRouteUserId(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const teamId =
      url.searchParams.get("teamId") || (await resolveCoachTeamId(userId));

    if (!teamId) {
      return NextResponse.json({
        ok: true,
        connected: false,
        reason: "no_team_assigned",
      });
    }

    const integration = await getPolarIntegrationByTeam(teamId);
    if (!integration) {
      return NextResponse.json({ ok: true, connected: false, teamId });
    }

    return NextResponse.json({
      ok: true,
      connected: integration.status === "active",
      status: integration.status,
      teamId,
      externalTeamId: integration.external_team_id,
      lastSyncedAt: integration.last_synced_at,
      lastSyncStatus: integration.last_sync_status,
      lastSyncError: integration.last_sync_error,
      tokenExpiresAt: integration.access_token_expires_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "status_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

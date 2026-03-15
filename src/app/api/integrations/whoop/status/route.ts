import { NextResponse } from "next/server";
import {
  getLatestWhoopSnapshotForAthlete,
  getWhoopIntegrationStatusForAthlete,
  resolveOwnedAthleteIdForPlayerUser,
} from "@/lib/server/integrations/whoopStore";
import { resolveWhoopRouteUserId } from "../_auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const userId = await resolveWhoopRouteUserId(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const athleteId = await resolveOwnedAthleteIdForPlayerUser(userId);
    const status = await getWhoopIntegrationStatusForAthlete(athleteId);
    const latestSnapshot = await getLatestWhoopSnapshotForAthlete(athleteId);

    return NextResponse.json({
      ok: true,
      athleteId,
      connected: status.connected,
      status: status.status,
      provider: "whoop",
      lastSyncedAt: status.lastSyncedAt,
      lastSyncStatus: status.lastSyncStatus,
      lastSyncError: status.lastSyncError,
      externalProfile: status.externalProfile,
      latestSnapshotDate: latestSnapshot?.date ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load WHOOP status.";
    const code = message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

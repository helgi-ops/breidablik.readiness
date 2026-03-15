import { NextResponse } from "next/server";
import { clearWhoopTokens, markWhoopIntegrationStatus, resolveOwnedAthleteIdForPlayerUser } from "@/lib/server/integrations/whoopStore";
import { resolveWhoopRouteUserId } from "../_auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const userId = await resolveWhoopRouteUserId(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const athleteId = await resolveOwnedAthleteIdForPlayerUser(userId);
    await clearWhoopTokens(athleteId);
    await markWhoopIntegrationStatus({
      athleteId,
      status: "revoked",
      lastSyncStatus: "never",
      error: null,
      clearTokens: false,
    });

    return NextResponse.json({ ok: true, status: "revoked" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WHOOP disconnect failed";
    const code = message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

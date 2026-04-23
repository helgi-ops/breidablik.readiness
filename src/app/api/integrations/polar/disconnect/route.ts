import { NextResponse } from "next/server";
import {
  markPolarIntegrationRevoked,
  resolveCoachTeamId,
} from "@/lib/server/integrations/polarStore";
import { resolvePolarRouteUserId } from "../_auth";

export const runtime = "nodejs";

/**
 * POST /api/integrations/polar/disconnect
 * Marks the team's Polar integration as revoked and clears tokens.
 * Note: Polar does not currently expose a token-revocation endpoint —
 * tokens become effectively unused but technically remain valid until expiry.
 */
export async function POST(req: Request) {
  try {
    const userId = await resolvePolarRouteUserId(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { teamId?: string };
    const teamId = body.teamId ?? (await resolveCoachTeamId(userId));
    if (!teamId) {
      return NextResponse.json(
        { ok: false, error: "No team to disconnect" },
        { status: 400 }
      );
    }

    await markPolarIntegrationRevoked(teamId);
    return NextResponse.json({ ok: true, teamId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "disconnect_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

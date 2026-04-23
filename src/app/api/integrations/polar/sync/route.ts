import { NextResponse } from "next/server";
import { syncPolarTeam } from "@/lib/integrations/polar/sync";
import { resolveCoachTeamId } from "@/lib/server/integrations/polarStore";
import { resolvePolarRouteUserId } from "../_auth";

export const runtime = "nodejs";

/**
 * POST /api/integrations/polar/sync
 * Body: { sinceDays?: number, teamId?: string }
 * Manually triggers a Polar Team Pro sync for the coach's team.
 */
export async function POST(req: Request) {
  try {
    const userId = await resolvePolarRouteUserId(req);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      sinceDays?: number;
      teamId?: string;
    };

    // Allow explicit teamId override (admin use), otherwise resolve from coach mapping
    const teamId = body.teamId ?? (await resolveCoachTeamId(userId));
    if (!teamId) {
      return NextResponse.json(
        { ok: false, error: "Coach is not assigned to any team — cannot sync Polar." },
        { status: 400 }
      );
    }

    const summary = await syncPolarTeam(teamId, {
      sinceDays: body.sinceDays ?? 14,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

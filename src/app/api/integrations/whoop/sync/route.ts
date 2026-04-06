import { NextResponse } from "next/server";
import { resolveOwnedAthleteIdForPlayerUser } from "@/lib/server/integrations/whoopStore";
import { syncWhoopForToday } from "@/lib/integrations/whoop/sync";
import { resolveWhoopRouteUserId } from "../_auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const userId = await resolveWhoopRouteUserId(request);
    if (!userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    await request.json().catch(() => ({}));
    const athleteId = await resolveOwnedAthleteIdForPlayerUser(userId);
    const result = await syncWhoopForToday({ athleteId });

    return NextResponse.json(
      {
        success: result.ok,
        status: result.status ?? (result.ok ? "success" : "error"),
        syncedDate: result.date,
        lastSyncedAt: result.lastSyncedAt ?? null,
        partial: result.partial,
        warnings: result.warnings,
        metrics: result.snapshot
          ? {
              recoveryScore: result.snapshot.recoveryScore ?? null,
              sleepPerformance: result.snapshot.sleepPerformance ?? null,
              workoutStrain: result.snapshot.workoutStrain ?? null,
            }
          : null,
        error: result.error,
      },
      { status: result.ok ? 200 : 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "WHOOP sync failed";
    const code = message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status: code });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use GET /api/integrations/whoop/status" }, { status: 405 });
}

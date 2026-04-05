import { NextResponse } from "next/server";
import { computeWeeklyLoad } from "@/lib/micropulse/externalLoad/weeklyLoadTracker";

export const runtime = "nodejs";

/**
 * GET /api/coach/weekly-load?teamId=...&date=2026-04-04
 *
 * Returns cumulative weekly GPS load for the team,
 * compared against the historical average full-week total.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get("teamId");
    const date = url.searchParams.get("date") ?? undefined;
    const playerId = url.searchParams.get("playerId") ?? undefined;

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const result = await computeWeeklyLoad({ teamId, date, playerId });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

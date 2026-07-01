import { NextResponse } from "next/server";
import { computeWeeklyLoad } from "@/lib/micropulse/externalLoad/weeklyLoadTracker";
import { WEEKLY_LOAD_METRICS_IMA } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";

export const runtime = "nodejs";

/**
 * GET /api/coach/weekly-load?teamId=...&date=2026-04-04[&group=ima]
 *
 * Returns cumulative weekly load for the team, compared against the historical
 * average full-week total. `group=ima` returns the IMA driver KPI set (total +
 * accel/decel/CoD) instead of the team's default GPS/indoor set.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get("teamId");
    const date = url.searchParams.get("date") ?? undefined;
    const playerId = url.searchParams.get("playerId") ?? undefined;
    const group = url.searchParams.get("group");

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const result = await computeWeeklyLoad({
      teamId,
      date,
      playerId,
      metrics: group === "ima" ? WEEKLY_LOAD_METRICS_IMA : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

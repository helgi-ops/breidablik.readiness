import { NextResponse } from "next/server";
import { computeMdComparison, type MdDay } from "@/lib/micropulse/externalLoad/mdComparison";

export const runtime = "nodejs";

/**
 * GET /api/coach/session-comparison?teamId=...&date=...&mdDay=MD-2
 *
 * Returns per-player Z-score and STEN comparisons of today's Catapult
 * metrics vs the rolling average of all historical sessions with the
 * same Match Day designation (e.g. all MD-2 sessions).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get("teamId");
    const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const mdDayOverride = url.searchParams.get("mdDay") as MdDay | null;

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    const result = await computeMdComparison({
      teamId,
      date,
      mdDayOverride: mdDayOverride ?? undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

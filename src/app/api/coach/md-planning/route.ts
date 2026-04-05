import { NextResponse } from "next/server";
import { computeMdPlanning, type MdDay } from "@/lib/micropulse/externalLoad/mdComparison";

export const runtime = "nodejs";

/**
 * GET /api/coach/md-planning?teamId=...&mdDay=MD-2
 *
 * Returns historical team-level averages for a given MD context.
 * Used for pre-session planning: "What does a typical MD-2 look like?"
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get("teamId");
    const mdDay = url.searchParams.get("mdDay") as MdDay | null;

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }
    if (!mdDay) {
      return NextResponse.json({ error: "mdDay is required" }, { status: 400 });
    }

    const result = await computeMdPlanning({ teamId, mdDay });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

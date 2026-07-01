/**
 * GET /api/coach/match-movement[?teamId=...]
 *
 * Per-player, per-match IMA "movement fingerprint" for the coach's team — the
 * driver-layer companion to GPS match comparison. One payload feeds all three
 * client views (player vs own norm / match A vs B / squad in one match).
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeMatchMovement } from "@/lib/micropulse/matchMovement";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userRes, error: uErr } = await sb.auth.getUser(token);
    if (uErr || !userRes?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = userRes.user.id;

    const url = new URL(req.url);
    const requestedTeamId = (url.searchParams.get("teamId") || "").trim() || null;

    // Resolve team: an explicit teamId the coach actually belongs to, else their
    // profile team. Prevents reading a team the coach isn't attached to.
    let teamId = requestedTeamId;
    if (teamId) {
      const { data: ct } = await sb
        .from("coach_teams")
        .select("team_id")
        .eq("coach_id", userId)
        .eq("team_id", teamId)
        .maybeSingle();
      if (!ct) teamId = null;
    }
    if (!teamId) {
      const { data: prof } = await sb.from("profiles").select("team_id").eq("id", userId).maybeSingle();
      teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
    }
    if (!teamId) return NextResponse.json({ error: "No team context" }, { status: 400 });

    const result = await computeMatchMovement({ teamId });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

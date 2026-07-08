/**
 * GET /api/player/today-recap
 *
 * The evening "close the loop" for the morning outlook: predicted vs actual for
 * TODAY plus one honest, positive insight. Self-scoped, and reuses
 * computePlayerToday so `plannedTarget` is provably the SAME number the morning
 * card showed. `actual` is the player's own REAL (non-estimated) player load for
 * today; the verdict uses the shared statusOf thresholds (same as the coach
 * planned-vs-actual). Health-first framing: over-plan is a recovery nudge, never
 * a "you smashed it". Self-hides when there's no actual yet / off-day / error.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { computePlayerToday } from "@/lib/micropulse/loadPlan/playerToday";
import { statusOf } from "@/lib/micropulse/loadPlan/plannedVsActual";
import { computePersonalRecords } from "@/lib/client/personalRecords";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: pl } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
    const teamId = (pl as { team_id?: string | null } | null)?.team_id ?? null;
    if (!teamId) return NextResponse.json({ show: false });

    const today = new Date().toISOString().slice(0, 10);
    const built = await computePlayerToday(sb, playerId, teamId, today);

    const plannedTarget = built.personalTarget;
    const actual = built.actualToday;
    // Nothing to close the loop on: no real session yet, off-day, or no usual.
    if (!built.planned.applicable || plannedTarget == null || actual == null) {
      return NextResponse.json({ show: false });
    }

    const { pct, status } = statusOf(plannedTarget, actual);

    // One honest, positive insight — never rewards higher load. A strength PB set
    // TODAY wins (a genuine small win); else an adherence/readiness note. On an
    // over-plan day we surface NO celebratory insight (the verdict carries the
    // recovery nudge instead).
    let insightKind: "pb" | "adherence" | "readiness" | null = null;
    let pb: { exercise: string; deltaKg: number } | null = null;
    try {
      const pr = await computePersonalRecords(sb, playerId);
      const top = pr.recent_prs?.[0];
      if (top && top.date === today && top.delta_kg > 0) {
        pb = { exercise: top.exercise, deltaKg: Math.round(top.delta_kg * 10) / 10 };
        insightKind = "pb";
      }
    } catch { /* PB insight optional */ }
    if (!insightKind) {
      if (status === "on") insightKind = "adherence";
      else if ((status === "under" || status === "well_under") && built.eased) insightKind = "readiness";
    }

    return NextResponse.json({
      show: true,
      mdLabel: built.planned.mdLabel,
      plannedTarget,
      plannedN: built.personalN,
      actual: Math.round(actual),
      adherencePct: pct,
      status, // "on" | "over" | "well_over" | "under" | "well_under"
      eased: built.eased,
      insightKind,
      pb,
    });
  } catch {
    return NextResponse.json({ show: false });
  }
}

/**
 * GET /api/coach/return-to-training/summary
 *
 * Team-wide return-to-training snapshot for the post-training report: for every
 * currently-injured / returning player (or one with an active plan), how their
 * ramp is going this week — RTP stage + actual vs recommended weekly load.
 * Reuses buildRttForPlayer so it never drifts from the RTT page. Team-scoped.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { buildRttForPlayer } from "@/lib/micropulse/rttForPlayer";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { teamId } = await requireCoachAccessForTeam(sb, req, null);
    if (!teamId) return NextResponse.json({ error: "Team context is required" }, { status: 400 });
    const now = new Date().toISOString().slice(0, 10);

    const [rosterRes, ieRes, piRes, planRes] = await Promise.all([
      sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true),
      sb.from("injury_events").select("player_id, return_date, is_active").eq("team_id", teamId),
      sb.from("player_injuries").select("player_id, status, actual_return_date").eq("team_id", teamId),
      sb.from("rtt_plans").select("player_id, rtt_start_date").eq("team_id", teamId),
    ]);

    const nameById = new Map<string, string>();
    for (const p of (rosterRes.data ?? []) as Array<{ id: string; full_name: string | null }>) nameById.set(p.id, p.full_name ?? "—");

    // Candidate players = currently injured (player_injuries authoritative; fall
    // back to injury_events) OR has an active RTT plan.
    const piByPlayer = new Map<string, Array<{ status: string | null; actual_return_date: string | null }>>();
    for (const r of (piRes.data ?? []) as Array<{ player_id: string; status: string | null; actual_return_date: string | null }>) {
      const arr = piByPlayer.get(r.player_id) ?? []; arr.push(r); piByPlayer.set(r.player_id, arr);
    }
    const ieByPlayer = new Map<string, Array<{ return_date: string | null; is_active: boolean | null }>>();
    for (const r of (ieRes.data ?? []) as Array<{ player_id: string; return_date: string | null; is_active: boolean | null }>) {
      const arr = ieByPlayer.get(r.player_id) ?? []; arr.push(r); ieByPlayer.set(r.player_id, arr);
    }
    const candidateIds = new Set<string>();
    for (const id of nameById.keys()) {
      const pi = piByPlayer.get(id);
      const injured = pi
        ? pi.some((r) => r.status !== "cleared" && !r.actual_return_date)
        : (ieByPlayer.get(id) ?? []).some((r) => r.is_active !== false && (!r.return_date || r.return_date >= now));
      if (injured) candidateIds.add(id);
    }
    for (const r of (planRes.data ?? []) as Array<{ player_id: string }>) if (nameById.has(r.player_id)) candidateIds.add(r.player_id);

    // Compute each candidate's ramp (bounded — injured players are few).
    const players = await Promise.all([...candidateIds].map(async (id) => {
      try {
        const b = await buildRttForPlayer(sb, id, teamId, 180);
        const cw = b.result.plan?.currentWeek ?? null;
        const adhWeek = cw != null ? b.result.adherence.find((a) => a.week === cw) : undefined;
        const vol = adhWeek?.cells.find((c) => c.quality === "volume");
        return {
          playerId: id,
          name: nameById.get(id) ?? "—",
          currentlyInjured: b.currentlyInjured,
          rtpStatus: b.rtp?.status ?? null,
          rtpStage: b.rtp?.stage ?? null,
          layoffDays: b.layoffDays ?? null,
          started: b.rttStartDate != null,
          rampWeeks: b.result.layoff.rampWeeks,
          currentWeek: cw,
          thisWeek: vol && (vol.actual > 0 || vol.target > 0)
            ? { status: vol.status, loadActual: vol.actual, loadTarget: vol.target, deltaPct: vol.deltaPct, inProgress: adhWeek?.inProgress ?? false }
            : null,
        };
      } catch {
        return { playerId: id, name: nameById.get(id) ?? "—", currentlyInjured: false, rtpStatus: null, rtpStage: null, layoffDays: null, started: false, rampWeeks: 0, currentWeek: null, thisWeek: null };
      }
    }));

    // Injured first, then by how far over the ramp (over = watch), then name.
    players.sort((a, b) =>
      Number(b.currentlyInjured) - Number(a.currentlyInjured)
      || (b.thisWeek?.status === "over" ? 1 : 0) - (a.thisWeek?.status === "over" ? 1 : 0)
      || a.name.localeCompare(b.name));

    return NextResponse.json({ teamId, players });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = /Unauthorized/.test(msg) ? 401 : /Forbidden/.test(msg) ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

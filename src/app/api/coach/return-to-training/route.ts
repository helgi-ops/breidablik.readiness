/**
 * GET /api/coach/return-to-training
 *
 * The team's injured / return-to-training players (the index for the RTT
 * surface). Team-scoped (requireCoachAccessForTeam). Injury status is the UNION
 * of injury_events + player_injuries — a player is "currently injured" if EITHER
 * table has an open window. Also returns the full active roster so a coach can
 * start a plan for a player with no injury record (edge case in the brief).
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

const today = () => new Date().toISOString().slice(0, 10);

type Row = { player_id: string; name: string; injuryType: string | null; injuryDate: string | null; returnDate: string | null; currentlyInjured: boolean };

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { teamId } = await requireCoachAccessForTeam(sb, req, null);
    if (!teamId) return NextResponse.json({ error: "Team context is required" }, { status: 400 });
    const now = today();

    const [rosterRes, ieRes, piRes] = await Promise.all([
      sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true).order("full_name"),
      sb.from("injury_events").select("player_id, injury_date, injury_type, return_date, is_active").eq("team_id", teamId),
      sb.from("player_injuries").select("player_id, injury_date, injury_type, status, estimated_return_date, actual_return_date").eq("team_id", teamId),
    ]);

    const nameById = new Map<string, string>();
    for (const p of (rosterRes.data ?? []) as Array<{ id: string; full_name: string | null }>) nameById.set(p.id, p.full_name ?? "—");

    // Fold both tables into one status per player (most-recent injury wins for
    // the label; currentlyInjured = ANY open window from EITHER table).
    const byPlayer = new Map<string, Row>();
    const note = (pid: string, injuryDate: string | null, type: string | null, returnDate: string | null, open: boolean) => {
      if (!nameById.has(pid)) return; // only this team's active roster
      const cur = byPlayer.get(pid) ?? { player_id: pid, name: nameById.get(pid)!, injuryType: null, injuryDate: null, returnDate: null, currentlyInjured: false };
      if (!cur.injuryDate || (injuryDate ?? "") > cur.injuryDate) { cur.injuryDate = injuryDate; cur.injuryType = type; cur.returnDate = returnDate; }
      if (open) cur.currentlyInjured = true;
      byPlayer.set(pid, cur);
    };
    // Open iff NOT explicitly closed. is_active === false / status === "cleared"
    // means resolved even when no return_date was recorded (the common case) —
    // treating a missing return_date as "still open" is what wrongly kept cleared
    // players flagged as injured.
    for (const r of (ieRes.data ?? []) as Array<{ player_id: string; injury_date: string; injury_type: string | null; return_date: string | null; is_active: boolean | null }>) {
      note(r.player_id, r.injury_date, r.injury_type, r.return_date, r.is_active !== false && (!r.return_date || r.return_date >= now));
    }
    for (const r of (piRes.data ?? []) as Array<{ player_id: string; injury_date: string; injury_type: string | null; status: string | null; actual_return_date: string | null; estimated_return_date: string | null }>) {
      const end = r.actual_return_date ?? r.estimated_return_date ?? now;
      note(r.player_id, r.injury_date, r.injury_type, end, r.status !== "cleared" && !r.actual_return_date && end >= now);
    }

    const injured = [...byPlayer.values()].sort((a, b) => Number(b.currentlyInjured) - Number(a.currentlyInjured) || (b.injuryDate ?? "").localeCompare(a.injuryDate ?? ""));
    const roster = [...nameById.entries()].map(([id, name]) => ({ id, name }));

    return NextResponse.json({ injured, roster });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

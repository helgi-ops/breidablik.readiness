/**
 * GET /api/coach/player/[id]/off-season-recommendation
 *   → recommends which 4-week block method (upper_lower / contrast / french_contrast) fits the player's
 *     off-season, from his needs profile (deficits, aerobic fit, strength lean, RTP, fatigue).
 *
 * Authorised via requireCoachAccessForTeam (admin cross-team). Read-only, advisory — never the colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { loadOffWeekPlans } from "@/lib/micropulse/offWeek/loader";
import { recommendOffSeasonMethod, type StrengthBase } from "@/lib/micropulse/strengthBlock/offSeasonRecommend";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const sb = getSupabaseAdmin();

  const { data: pl } = await sb.from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  const player = pl as { id: string; team_id: string | null } | null;
  if (!player?.team_id) return NextResponse.json({ ok: false, error: "Player not found" }, { status: 404 });

  try {
    const { teamId } = await requireCoachAccessForTeam(sb, req, player.team_id);
    if (teamId !== player.team_id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const st = /forbidden/i.test(msg) ? 403 : /unauth|token|auth/i.test(msg) ? 401 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status: st });
  }

  // Reuse the off-week needs derivation for this one player.
  const { players } = await loadOffWeekPlans(sb, { teamId: player.team_id, playerIds: [playerId], days: 7, gymAccess: "gym" });
  const needs = players[0]?.needs ?? {};

  // Strength base from VBT (GymAware): recent heavy/slow work (max-strength velocity zone ≤ 0.55 m/s)
  // demonstrates the base French Contrast needs. Last ~120 days.
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const { data: vbtRows } = await sb
    .from("gymaware_vbt_sessions")
    .select("session_date, exercise_name, load_kg, mean_velocity")
    .eq("player_id", playerId)
    .gte("session_date", since)
    .order("session_date", { ascending: false })
    .limit(200);
  const rows = (vbtRows ?? []) as Array<{ exercise_name: string | null; load_kg: number | null; mean_velocity: number | null }>;
  const heavy = rows
    .filter((r) => typeof r.mean_velocity === "number" && r.mean_velocity! > 0 && r.mean_velocity! <= 0.55 && typeof r.load_kg === "number" && r.load_kg! > 0)
    .sort((a, b) => (a.mean_velocity ?? 9) - (b.mean_velocity ?? 9))[0];
  const base: StrengthBase = heavy
    ? {
        strongBase: true, hasVbt: true,
        detailEN: `heaviest recent set ${Math.round(heavy.load_kg!)} kg @ ${heavy.mean_velocity!.toFixed(2)} m/s${heavy.exercise_name ? ` · ${heavy.exercise_name}` : ""}`,
        detailIS: `þyngsta nýlega sett ${Math.round(heavy.load_kg!)} kg á ${heavy.mean_velocity!.toFixed(2)} m/s${heavy.exercise_name ? ` · ${heavy.exercise_name}` : ""}`,
      }
    : { strongBase: false, hasVbt: rows.length > 0 };

  const recommendation = recommendOffSeasonMethod(needs, base);

  return NextResponse.json({ ok: true, recommendation, base: { strongBase: base.strongBase, hasVbt: base.hasVbt } });
}

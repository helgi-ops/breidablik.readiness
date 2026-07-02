/**
 * GET /api/player/match-movement
 *
 * The player's OWN movement (IMA) profile. Self-scoped: the player_id comes from
 * auth, never a param. Returns only this player's match fingerprints + his squad
 * percentiles + anonymised squad medians — never another player's identified
 * rows (the squad context is aggregate only).
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeMatchMovement } from "@/lib/micropulse/matchMovement";
import { movementDimensions, type DimensionKey, type MovementFingerprint } from "@/lib/micropulse/matchMovement/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: userRes, error: uErr } = await sb.auth.getUser(token);
    if (uErr || !userRes?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const uid = userRes.user.id;

    // Resolve THIS player from auth (never a param) + his team.
    const { data: pl } = await sb.from("players").select("id, team_id").eq("user_id", uid).maybeSingle();
    const player = pl as { id: string; team_id: string | null } | null;
    if (!player?.team_id) return NextResponse.json({ error: "No player/team context" }, { status: 400 });

    const full = await computeMatchMovement({ teamId: player.team_id });

    // Extract ONLY this player's rows + anonymised squad aggregates.
    const matches = full.rows
      .filter((r) => r.player_id === player.id)
      .sort((a, b) => b.match_date.localeCompare(a.match_date))
      .map((r) => ({ date: r.match_date, minutes: r.minutes, fingerprint: r.fingerprint }));
    const average = full.playerAverages[player.id] ?? null;

    const allAvgs = Object.values(full.playerAverages);
    const percentiles = {} as Record<DimensionKey, number>;
    const squadMedian = {} as MovementFingerprint;
    for (const d of movementDimensions(full.variant)) {
      const vals = allAvgs.map((fp) => fp[d.key]).filter((v): v is number => v != null).sort((a, b) => a - b);
      const mine = average?.[d.key] ?? null;
      percentiles[d.key] = mine != null && vals.length >= 2 ? Math.round((vals.filter((v) => v < mine).length / (vals.length - 1)) * 100) : 50;
      squadMedian[d.key] = vals.length ? vals[Math.floor(vals.length / 2)] : null;
    }

    return NextResponse.json({ variant: full.variant, matches, average, percentiles, squadMedian, matchCount: matches.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

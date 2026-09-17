export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/coach/load/peak-window?player=<id>
 *
 * Peak HIGH-INTENSITY EFFORT windows (Accel / Decel / CoD) for one player, read from
 * `player_peak_window` (populated by the CTR peak-window upload). These are effort
 * COUNTS in the fixed-time interval bins (1 / 3 / 5-min), High band only, CoD = Left+Right
 * — NOT sustainable intensity, so they live on the IMA/decel surface, not the running
 * Power Curve. Returns the LATEST match's peak per window length.
 *
 * Descriptive load context — never feeds the readiness colour or the daily decision.
 * Cite: McBurnie 2022 (deceleration burden). Auth: coach token, player on coach's team.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

type Row = {
  match_date: string | null;
  window_min: number | null;
  ima_accel: number | null;
  ima_decel: number | null;
  ima_cod: number | null;
};

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get("player") ?? "";
  if (!playerId) return NextResponse.json({ error: "player query param required" }, { status: 400 });

  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ error: "Coach not linked to a team" }, { status: 400 });

  const { data: player } = await sb.from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  if (!player || (player as { team_id?: string }).team_id !== teamId) {
    return NextResponse.json({ error: "Player not on your team" }, { status: 404 });
  }

  const { data, error } = await sb
    .from("player_peak_window")
    .select("match_date, window_min, ima_accel, ima_decel, ima_cod")
    .eq("player_id", playerId)
    .eq("source", "catapult_ctr")
    .not("window_min", "is", null)
    .order("match_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep only the effort rows (Accel/Decel/CoD peaks carry one of these; HSR/PL/Dist
  // peaks leave all three null).
  const rows = ((data ?? []) as Row[]).filter(
    (r) => r.ima_accel != null || r.ima_decel != null || r.ima_cod != null,
  );
  if (rows.length === 0) return NextResponse.json({ ok: true, matchDate: null, windows: [] });

  // Latest match, then one entry per window length (coalesce the per-metric rows;
  // take the max if a window somehow appears twice).
  const matchDate = rows[0].match_date; // already sorted desc
  const byWindow = new Map<number, { windowMin: number; accel: number | null; decel: number | null; cod: number | null }>();
  const mx = (a: number | null, b: number | null): number | null =>
    a == null ? b : b == null ? a : Math.max(a, b);
  for (const r of rows) {
    if (r.match_date !== matchDate || r.window_min == null) continue;
    const w = Number(r.window_min);
    const cur = byWindow.get(w) ?? { windowMin: w, accel: null, decel: null, cod: null };
    cur.accel = mx(cur.accel, r.ima_accel);
    cur.decel = mx(cur.decel, r.ima_decel);
    cur.cod = mx(cur.cod, r.ima_cod);
    byWindow.set(w, cur);
  }
  const windows = [...byWindow.values()].sort((a, b) => a.windowMin - b.windowMin);

  return NextResponse.json({ ok: true, matchDate, windows });
}

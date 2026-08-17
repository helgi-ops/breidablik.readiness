export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/load/movement-style?player=<id>  (GET)
 *
 * Movement style (linear ↔ multidirectional) for the selected player, read squad-relative.
 * Combines the two IMA feeds: high-intensity change-of-direction (the ima_clock_gen2 high
 * tier) vs fast linear running (IMA free-running bands 5–8 PlayerLoad). ADI's linear-vs-
 * multidirectional distinction, IMA-native — see movementStyle.ts. Descriptive load context
 * — never touches the readiness colour, the load target, or the daily decision. Team-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { computeSquadStyle, type PlayerStyleInput } from "@/lib/micropulse/load/movementStyle";

type Row = {
  player_id: string;
  ima_clock_gen2: Record<string, { high?: unknown }> | null;
  ima_fr_band5_total_player_load: number | string | null;
  ima_fr_band6_total_player_load: number | string | null;
  ima_fr_band7_total_player_load: number | string | null;
  ima_fr_band8_total_player_load: number | string | null;
};

const n = (v: unknown): number => { const x = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN; return Number.isFinite(x) ? x : 0; };
/** Sum the clock's high tier across all 12 directions. */
function clockHigh(grid: Row["ima_clock_gen2"]): number {
  if (!grid || typeof grid !== "object") return 0;
  let t = 0;
  for (const cell of Object.values(grid)) t += n((cell as { high?: unknown })?.high);
  return t;
}

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ ok: false, error: "No team" }, { status: 400 });

  const playerId = String(new URL(req.url).searchParams.get("player") ?? "").trim();
  if (!playerId) return NextResponse.json({ ok: false, error: "player is required" }, { status: 400 });
  const { data: player } = await sb.from("players").select("id, full_name, position").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return NextResponse.json({ ok: false, error: "Player not on your team" }, { status: 403 });
  const p = player as { full_name: string | null; position: string | null };

  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.parse(today + "T00:00:00Z") - 40 * 86_400_000).toISOString().slice(0, 10);

  // Whole squad (team-scoped) so the selected player is placed against his peers.
  const rows = await fetchAllPages<Row>((from, to) => sb
    .from("player_external_load_daily")
    .select("player_id, ima_clock_gen2, ima_fr_band5_total_player_load, ima_fr_band6_total_player_load, ima_fr_band7_total_player_load, ima_fr_band8_total_player_load")
    .eq("team_id", teamId)
    .in("source", ["catapult", "manual"])
    .gte("date", start)
    .lte("date", today)
    .range(from, to));

  // Sum per player over the window.
  const cod = new Map<string, number>();
  const lin = new Map<string, number>();
  for (const r of rows ?? []) {
    cod.set(r.player_id, (cod.get(r.player_id) ?? 0) + clockHigh(r.ima_clock_gen2));
    lin.set(r.player_id, (lin.get(r.player_id) ?? 0) + n(r.ima_fr_band5_total_player_load) + n(r.ima_fr_band6_total_player_load) + n(r.ima_fr_band7_total_player_load) + n(r.ima_fr_band8_total_player_load));
  }
  const inputs: PlayerStyleInput[] = [...new Set([...cod.keys(), ...lin.keys()])].map((pid) => ({
    playerId: pid, codLoad: cod.get(pid) ?? 0, linearFastLoad: lin.get(pid) ?? 0,
  }));

  const reads = computeSquadStyle(inputs);
  const mine = reads.find((r) => r.playerId === playerId) ?? null;
  const squadRanked = reads.filter((r) => r.percentile != null).length;

  if (!mine || mine.ratio == null) {
    return NextResponse.json({ ok: true, player_id: playerId, name: p.full_name, position: p.position, hasData: false, squadRanked });
  }

  return NextResponse.json({
    ok: true, player_id: playerId, name: p.full_name, position: p.position,
    hasData: true, squadRanked, style: mine,
    note: "Movement style (linear ↔ multidirectional) from IMA clock vs IMA free-running, squad-relative. Descriptive — never touches readiness.",
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/player/basketball-game-report
 *
 * GET — the PLAYER's OWN per-game basketball stats for the season, from the KKÍ box scores
 * (basketball_fiba_games.own_box). Self-scoped: player_id from auth. The football "Match" game report
 * (GPS per-90) is empty for basketball teams (no GPS / no match_player_minutes), so this is the
 * basketball equivalent. Descriptive — never the readiness colour.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { initialSurnameKey } from "@/lib/micropulse/statsIngestion/nameMatch";

type BoxRow = {
  name?: string; min?: string; pts?: number; reb?: number; oreb?: number; dreb?: number; ast?: number;
  stl?: number; blk?: number; tov?: number; fgm?: number; fga?: number; tpm?: number; tpa?: number;
  ftm?: number; fta?: number; pip?: number; pm?: number;
};

const nn = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try { ({ playerId } = await requireAuthedPlayerId(sb, req)); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 }); }

  const { data: p } = await sb.from("players").select("team_id, full_name").eq("id", playerId).maybeSingle();
  const teamId = (p?.team_id as string | null) ?? null;
  const fullName = (p?.full_name as string | null) ?? "";
  if (!teamId) return NextResponse.json({ ok: false, error: "Player not linked to a team" }, { status: 400 });

  const { data: team } = await sb.from("teams").select("sport").eq("id", teamId).maybeSingle();
  const isBasketball = String((team as { sport?: string | null } | null)?.sport ?? "").toLowerCase() === "basketball";
  if (!isBasketball) return NextResponse.json({ ok: true, isBasketball: false, games: [], summary: null });

  const myKey = initialSurnameKey(fullName); // "D. Rodriguez"(box) ↔ "Danielle Rodriguez"(roster)
  const { data: games } = await sb.from("basketball_fiba_games")
    .select("match_date, opp_name, own_box")
    .eq("owner_team_id", teamId).order("match_date", { ascending: true });

  type Game = {
    date: string; opponent: string; min: string | null; pts: number; reb: number; oreb: number; dreb: number;
    ast: number; stl: number; blk: number; tov: number; fgm: number; fga: number; tpm: number; tpa: number;
    ftm: number; fta: number; pip: number; pm: number | null;
  };
  const rows: Game[] = [];
  for (const g of (games ?? []) as Array<{ match_date: string; opp_name: string | null; own_box: BoxRow[] | null }>) {
    const box = Array.isArray(g.own_box) ? g.own_box : [];
    const mine = myKey ? box.find((b) => b.name && initialSurnameKey(b.name) === myKey) : undefined;
    if (!mine) continue;
    rows.push({
      date: g.match_date, opponent: g.opp_name ?? "—", min: mine.min ?? null,
      pts: nn(mine.pts), reb: nn(mine.reb), oreb: nn(mine.oreb), dreb: nn(mine.dreb), ast: nn(mine.ast),
      stl: nn(mine.stl), blk: nn(mine.blk), tov: nn(mine.tov), fgm: nn(mine.fgm), fga: nn(mine.fga),
      tpm: nn(mine.tpm), tpa: nn(mine.tpa), ftm: nn(mine.ftm), fta: nn(mine.fta), pip: nn(mine.pip),
      pm: typeof mine.pm === "number" ? mine.pm : null,
    });
  }

  const gp = rows.length;
  const total = (k: keyof Game) => rows.reduce((a, r) => a + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  const avg = (k: keyof Game) => (gp ? Math.round((total(k) / gp) * 10) / 10 : 0);
  const pct = (m: number, a: number) => (a > 0 ? Math.round((m / a) * 1000) / 10 : 0);
  const summary = gp ? {
    games: gp, ppg: avg("pts"), rpg: avg("reb"), apg: avg("ast"), spg: avg("stl"), bpg: avg("blk"),
    fgPct: pct(total("fgm"), total("fga")), tpPct: pct(total("tpm"), total("tpa")), ftPct: pct(total("ftm"), total("fta")),
    bestPts: rows.reduce((m, r) => Math.max(m, r.pts), 0),
  } : null;

  // Newest game first for the list.
  rows.reverse();
  return NextResponse.json({ ok: true, isBasketball: true, playerName: fullName, games: rows, summary });
}

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
import { latestSeason } from "@/lib/micropulse/basketballStats/season";
import { groupStats, type GroupedStat } from "@/lib/micropulse/basketballStats/instatStatGroups";
import { aggregatePhysical } from "@/lib/micropulse/basketballStats/basketballPhysical";

/** Parse an InStat cell to a number (strip "%", commas), or null when blank / non-numeric. */
function statNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/%/g, "").replace(/,/g, "");
  if (!s || s === "-" || s === "—") return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
}

/** Aggregate the player's own per-game InStat rows → ONE season line (per-game average of every
 *  numeric column), then group it for the "all stats" view. Averages each column only over the
 *  games that reported it. Empty → null. */
function aggregatePlayerAllStats(rows: Array<{ stats: Record<string, unknown> | null }>): GroupedStat[] | null {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (!r.stats) continue;
    for (const [k, raw] of Object.entries(r.stats)) {
      const num = statNum(raw);
      if (num == null) continue;
      const cur = sums.get(k) ?? { sum: 0, n: 0 };
      cur.sum += num; cur.n += 1; sums.set(k, cur);
    }
  }
  if (sums.size === 0) return null;
  const bag: Record<string, number> = {};
  for (const [k, { sum, n }] of sums) bag[k] = Math.round((sum / n) * 10) / 10;
  const grouped = groupStats(bag);
  return grouped.length ? grouped : null;
}

type BoxRow = {
  name?: string; min?: string; pts?: number; reb?: number; oreb?: number; dreb?: number; ast?: number;
  stl?: number; blk?: number; tov?: number; fgm?: number; fga?: number; tpm?: number; tpa?: number;
  ftm?: number; fta?: number; pip?: number; pm?: number;
};

const nn = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Competition code → short label shown on each game (so a player who plays both the main team and a
 *  reserve / lower-division side sees which team each game was for). */
function compLabel(code: string | null): string {
  switch ((code ?? "").toLowerCase()) {
    case "urvalsdeild-kvenna":
    case "urvalsdeild-karla": return "Úrvalsdeild";
    case "bonus-deild-karla":
    case "bonus-deild-kvenna": return "Bónus deild";
    case "1deild-kvenna":
    case "1deild-karla": return "1. deild";
    default: return code ? code : "Leikir";
  }
}

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
    .select("match_date, opp_name, own_box, competition_code, season")
    .eq("owner_team_id", teamId);

  // Scope to the CURRENT season (the team's newest season label) so last season's games don't linger in
  // the player's Match tab — but keep them in the DB (they power the league/run-trend reads). When the
  // team has no season-shaped labels at all (legacy data), show everything.
  const allGames = (games ?? []) as Array<{ match_date: string | null; opp_name: string | null; own_box: BoxRow[] | null; competition_code: string | null; season: string | null }>;
  const season = latestSeason(allGames.map((g) => g.season));
  const scoped = season ? allGames.filter((g) => g.season === season) : allGames;

  type Game = {
    date: string | null; opponent: string; comp: string | null; compLabel: string; min: string | null;
    pts: number; reb: number; oreb: number; dreb: number;
    ast: number; stl: number; blk: number; tov: number; fgm: number; fga: number; tpm: number; tpa: number;
    ftm: number; fta: number; pip: number; pm: number | null;
  };
  const rows: Game[] = [];
  for (const g of scoped) {
    const box = Array.isArray(g.own_box) ? g.own_box : [];
    const mine = myKey ? box.find((b) => b.name && initialSurnameKey(b.name) === myKey) : undefined;
    if (!mine) continue;
    rows.push({
      date: g.match_date ?? null, opponent: g.opp_name ?? "—", comp: g.competition_code ?? null, compLabel: compLabel(g.competition_code),
      min: mine.min ?? null,
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

  // Per-competition split (so main-team vs reserve/lower-division games are legible at a glance).
  const compMap = new Map<string, { label: string; games: number; pts: number }>();
  for (const r of rows) {
    const key = r.compLabel;
    const e = compMap.get(key) ?? { label: r.compLabel, games: 0, pts: 0 };
    e.games += 1; e.pts += r.pts; compMap.set(key, e);
  }
  const byComp = [...compMap.values()].map((c) => ({ label: c.label, games: c.games, ppg: Math.round((c.pts / c.games) * 10) / 10 }))
    .sort((a, b) => b.games - a.games);

  const r1 = (x: number) => Math.round(x * 10) / 10;
  const summary = gp ? {
    games: gp, ppg: avg("pts"), rpg: avg("reb"), apg: avg("ast"), spg: avg("stl"), bpg: avg("blk"), topg: avg("tov"),
    fgPct: pct(total("fgm"), total("fga")), tpPct: pct(total("tpm"), total("tpa")), ftPct: pct(total("ftm"), total("fta")),
    bestPts: rows.reduce((m, r) => Math.max(m, r.pts), 0),
    // Shooting splits — makes/attempts per game, by shot type (2PT = all FG minus threes).
    shooting: {
      two: { m: r1((total("fgm") - total("tpm")) / gp), a: r1((total("fga") - total("tpa")) / gp) },
      three: { m: r1(total("tpm") / gp), a: r1(total("tpa") / gp) },
      ft: { m: r1(total("ftm") / gp), a: r1(total("fta") / gp) },
    },
    byComp: byComp.length > 1 ? byComp : [], // only worth showing when the player spans >1 competition
  } : null;

  // Detailed InStat stats — the player's OWN full variable set (play types, shot quality, advanced),
  // season per-game averages, grouped. Matched by player_id (populated on the InStat import). Gives
  // basketball players the "show all stats" depth football players already get. Null when no InStat.
  const { data: instatRows } = await sb.from("player_basketball_match_stats")
    .select("stats").eq("player_id", playerId).eq("source", "instat");
  const allStats = aggregatePlayerAllStats(((instatRows ?? []) as Array<{ stats: Record<string, unknown> | null }>));

  // The player's OWN Titan indoor load — session player-load, impacts and jumps, averaged. Their own
  // training output, for self-awareness; descriptive only, NEVER a readiness/fitness score. Null when none.
  const { data: titanRows } = await sb.from("player_external_load_daily")
    .select("player_load, impacts, jumps").eq("player_id", playerId).eq("source", "titan");
  const titanAgg = aggregatePhysical(((titanRows ?? []) as Array<{ player_load: number | null; impacts: number | null; jumps: number | null }>)
    .map((r) => ({ playerId, playerLoad: r.player_load, impacts: r.impacts, jumps: r.jumps })));
  const titan = titanAgg.length && titanAgg[0].sessions > 0
    ? { sessions: titanAgg[0].sessions, playerLoad: titanAgg[0].playerLoad, impacts: titanAgg[0].impacts, jumps: titanAgg[0].jumps }
    : null;

  // Newest game first for the list (dated games lead, newest→oldest; undated games trail in stored order).
  rows.sort((x, y) => {
    if (x.date && y.date) return y.date.localeCompare(x.date);
    if (x.date) return -1;
    if (y.date) return 1;
    return 0;
  });
  return NextResponse.json({ ok: true, isBasketball: true, playerName: fullName, season, games: rows, summary, allStats, titan });
}

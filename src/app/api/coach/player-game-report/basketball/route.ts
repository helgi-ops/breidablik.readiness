export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/player-game-report/basketball?player_id=<uuid>&season=<year>
 *   &roster_only=1 | bootstrap=1
 *
 * The basketball counterpart of the (football/GPS) player game report: one
 * player's per-game box scores + season averages, for the shareable report.
 * Basketball is indoor / no-GPS, so this is box-score based, not per-90.
 * Source = KKÍ feed (player_basketball_match_stats). Descriptive — never the
 * readiness colour. Coach-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error } = await supabase.auth.getUser(token);
  if (error || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { teamId, supabase } as const;
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const n0 = (v: number | null) => v ?? 0;
const pct = (m: number, a: number) => (a > 0 ? Math.round((m / a) * 1000) / 10 : null);
const avg = (sum: number, g: number) => (g > 0 ? Math.round((sum / g) * 10) / 10 : 0);

type Row = Record<string, unknown>;

export async function GET(req: NextRequest) {
  const ctx = await authTeam(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;

  const sport = await resolveTeamSport(supabase, teamId);

  const url = new URL(req.url);
  const playerId = (url.searchParams.get("player_id") || "").trim() || null;
  const seasonParam = (url.searchParams.get("season") || "").trim();

  // All the team's basketball match rows (mapped players only — the report is
  // per app-player). Order newest first; we group and pick a season below.
  const { data: allRows, error } = await supabase
    .from("player_basketball_match_stats")
    .select("player_id, game_id, game_date, opponent, home_away, minutes, points, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb, reb, assists, steals, blocks, turnovers, fouls, plus_minus, efficiency, source_player_ref, source_player_name, players:player_id(full_name, position)")
    .eq("team_id", teamId)
    .not("player_id", "is", null)
    .order("game_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (allRows ?? []) as Row[];

  const yearOf = (r: Row) => String((r.game_date as string) ?? "").slice(0, 4);
  const years = [...new Set(rows.map(yearOf).filter((y) => /^\d{4}$/.test(y)))].sort().reverse();
  const latestYear = years[0] ?? String(new Date().getUTCFullYear());
  // Chosen season: the param if it actually has rows, else the latest with data.
  let season = seasonParam || latestYear;
  if (!years.includes(season)) season = latestYear;

  // Roster = mapped players with any basketball rows (season-independent so the
  // picker is stable), name + position from the players join.
  const rosterMap = new Map<string, { id: string; full_name: string; position: string | null }>();
  for (const r of rows) {
    const pid = String(r.player_id ?? "");
    if (!pid || rosterMap.has(pid)) continue;
    const pj = Array.isArray(r.players) ? r.players[0] : r.players;
    rosterMap.set(pid, {
      id: pid,
      full_name: (pj as { full_name?: string } | null)?.full_name ?? (r.source_player_name as string) ?? "—",
      position: (pj as { position?: string } | null)?.position ?? null,
    });
  }
  const roster = [...rosterMap.values()].sort((a, b) => a.full_name.localeCompare(b.full_name, "is"));

  if (url.searchParams.get("roster_only") === "1") {
    return NextResponse.json({ sport, season: Number(season), roster });
  }

  const pickId = playerId ?? roster[0]?.id ?? null;
  const info = pickId ? rosterMap.get(pickId) : null;

  // This player's games in the chosen season, oldest → newest. Rows without a
  // parseable date (seeded/edge data) are never dropped — they show under the
  // selected season rather than silently vanishing.
  const mine = rows.filter((r) => String(r.player_id ?? "") === pickId && (yearOf(r) === season || !/^\d{4}$/.test(yearOf(r))));
  const games = mine.map((r) => ({
    gameId: String(r.game_id ?? ""),
    date: (r.game_date as string) ?? null,
    opponent: (r.opponent as string) ?? null,
    homeAway: (r.home_away as string) ?? null,
    kkiRef: /^\d+$/.test(String(r.source_player_ref ?? "")) ? String(r.source_player_ref) : null,
    minutes: num(r.minutes), points: num(r.points),
    fgm: num(r.fgm), fga: num(r.fga), tpm: num(r.tpm), tpa: num(r.tpa), ftm: num(r.ftm), fta: num(r.fta),
    oreb: num(r.oreb), dreb: num(r.dreb), reb: num(r.reb),
    assists: num(r.assists), steals: num(r.steals), blocks: num(r.blocks), turnovers: num(r.turnovers),
    fouls: num(r.fouls), plusMinus: num(r.plus_minus), efficiency: num(r.efficiency),
  }));

  // Season summary: per-game averages + shooting splits from the totals.
  const g = games.length;
  const S = (k: keyof (typeof games)[number]) => games.reduce((a, r) => a + n0(r[k] as number | null), 0);
  const tot = {
    minutes: S("minutes"), points: S("points"),
    fgm: S("fgm"), fga: S("fga"), tpm: S("tpm"), tpa: S("tpa"), ftm: S("ftm"), fta: S("fta"),
    reb: S("reb"), oreb: S("oreb"), dreb: S("dreb"),
    assists: S("assists"), steals: S("steals"), blocks: S("blocks"), turnovers: S("turnovers"), fouls: S("fouls"),
  };
  const summary = {
    games: g,
    minutes: tot.minutes,
    ppg: avg(tot.points, g), rpg: avg(tot.reb, g), apg: avg(tot.assists, g),
    spg: avg(tot.steals, g), bpg: avg(tot.blocks, g), topg: avg(tot.turnovers, g),
    mpg: avg(tot.minutes, g),
    fgPct: pct(tot.fgm, tot.fga), tpPct: pct(tot.tpm, tot.tpa), ftPct: pct(tot.ftm, tot.fta),
    totals: tot,
  };

  return NextResponse.json({
    sport,
    season: Number(season),
    availableSeasons: years.map(Number),
    player: info ? { id: info.id, full_name: info.full_name, position: info.position } : null,
    roster,
    games,
    summary,
  });
}

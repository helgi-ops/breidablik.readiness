export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/basketball-kki?url=<kki.is Leikur link>  (or ?gameId=&seasonId=)
 *
 * Single-match read straight from KKÍ.is — the free baskethotel widget feed the kki.is match page uses
 * (FIBA LiveStats blocks server fetches with a 403; this is the robust public alternative). Returns the
 * FULL box score for BOTH teams, team totals and the Four Factors (Oliver 2004). The shot chart is a
 * separate image endpoint (/api/coach/player-stats/shot-chart). Coach-scoped, descriptive only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { parseBoxScore, parseQuarterScores, parseAdvancedStats } from "@/lib/micropulse/basketballStats/parseWidget";
import { buildBoxScoreUrl, buildGameViewUrl, buildAdvancedStatsUrl, fetchWidget, parseKkiGameUrl } from "@/lib/integrations/basketball/kkiWidget";

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
  const teamId = prof?.team_id as string | null;
  if (!teamId) return NextResponse.json({ ok: false, error: "No team" }, { status: 400 });

  const sp = new URL(req.url).searchParams;
  const parsed = sp.get("url") ? parseKkiGameUrl(sp.get("url")!) : { gameId: sp.get("gameId"), seasonId: sp.get("seasonId") };
  const gameId = (parsed.gameId ?? "").trim();
  if (!/^\d+$/.test(gameId)) return NextResponse.json({ ok: false, error: "Could not read a game_id from that link." }, { status: 400 });

  // Season from the link; fall back to the team's configured KKÍ season.
  let seasonId = parsed.seasonId && /^\d+$/.test(parsed.seasonId) ? parsed.seasonId : "";
  if (!seasonId) {
    const { data: cfg } = await supabase.from("stat_ingestion_config").select("basketball_team_ref").eq("team_id", teamId).maybeSingle();
    seasonId = (((cfg as { basketball_team_ref?: string | null } | null)?.basketball_team_ref ?? "").split(":")[0] ?? "").trim();
  }
  if (!/^\d+$/.test(seasonId)) return NextResponse.json({ ok: false, error: "No season_id in the link and none configured." }, { status: 400 });

  let rows;
  try {
    rows = parseBoxScore(await fetchWidget(buildBoxScoreUrl(gameId, seasonId)), gameId, teamId, "baskethotel");
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "KKÍ fetch failed" }, { status: 502 });
  }
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "No box score for that game." }, { status: 404 });

  const player = (r: typeof rows[number]) => ({
    name: r.playerName, ref: r.sourcePlayerRef, min: r.minutes, pts: n(r.points),
    twoM: n(r.fgm) - n(r.tpm), twoA: n(r.fga) - n(r.tpa), threeM: n(r.tpm), threeA: n(r.tpa),
    fgM: n(r.fgm), fgA: n(r.fga), ftM: n(r.ftm), ftA: n(r.fta),
    oreb: n(r.oreb), dreb: n(r.dreb), reb: n(r.reb),
    ast: n(r.assists), fouls: n(r.fouls), to: n(r.turnovers), stl: n(r.steals), blk: n(r.blocks),
    eff: r.efficiency ?? null, pm: r.plusMinus ?? null,
  });
  type P = ReturnType<typeof player>;
  const sum = (ps: P[], k: keyof P) => ps.reduce((a, p) => a + n(p[k] as number), 0);

  const byTeam = new Map<string, P[]>();
  for (const r of rows) { const t = r.team ?? "—"; const arr = byTeam.get(t) ?? []; arr.push(player(r)); byTeam.set(t, arr); }
  const teams = [...byTeam.entries()].map(([name, players]) => {
    const totals = {
      pts: sum(players, "pts"), reb: sum(players, "reb"), oreb: sum(players, "oreb"), dreb: sum(players, "dreb"),
      ast: sum(players, "ast"), stl: sum(players, "stl"), blk: sum(players, "blk"), to: sum(players, "to"), fouls: sum(players, "fouls"),
      fgM: sum(players, "fgM"), fgA: sum(players, "fgA"), threeM: sum(players, "threeM"), threeA: sum(players, "threeA"),
      ftM: sum(players, "ftM"), ftA: sum(players, "ftA"), twoM: sum(players, "twoM"), twoA: sum(players, "twoA"),
    };
    return { name, players: players.sort((a, b) => b.pts - a.pts), totals };
  });

  // Four Factors (Oliver 2004): computed between the two teams. Only when both have shooting totals.
  type FF = { efg: number; tovPct: number; orebPct: number; ftRate: number; tp3: number };
  const factorsFor = (t: typeof teams[number], opp: typeof teams[number]): FF => {
    const b = t.totals, o = opp.totals;
    return {
      efg: b.fgA > 0 ? (b.fgM + 0.5 * b.threeM) / b.fgA : 0,
      tovPct: b.fgA + 0.44 * b.ftA + b.to > 0 ? b.to / (b.fgA + 0.44 * b.ftA + b.to) : 0,
      orebPct: b.oreb + o.dreb > 0 ? b.oreb / (b.oreb + o.dreb) : 0,
      ftRate: b.fgA > 0 ? b.ftM / b.fgA : 0,
      tp3: b.threeA > 0 ? b.threeM / b.threeA : 0,
    };
  };
  const withFactors = teams.length === 2
    ? teams.map((t, i) => ({ ...t, factors: factorsFor(t, teams[i === 0 ? 1 : 0]) }))
    : teams.map((t) => ({ ...t, factors: null as FF | null }));

  // Quarter-by-quarter line score (default game view) + advanced team-comparison stats — both best-effort,
  // so a missing block never breaks the box score.
  let quarters: { a: number[]; b: number[] } | null = null;
  let advanced: Array<{ label: string; a: string; b: string }> = [];
  await Promise.all([
    (async () => { try { quarters = parseQuarterScores(await fetchWidget(buildGameViewUrl(gameId, seasonId))); } catch { /* optional */ } })(),
    (async () => { try { advanced = parseAdvancedStats(await fetchWidget(buildAdvancedStatsUrl(gameId, seasonId))); } catch { /* optional */ } })(),
  ]);

  // Stat leaders — the top player in each category across both teams (from the box score we already have).
  const allPlayers = teams.flatMap((t) => t.players.map((p) => ({ ...p, team: t.name })));
  const leaderIn = (key: keyof P, labelEn: string, labelIs: string) => {
    const top = allPlayers.reduce<(typeof allPlayers)[number] | null>((best, p) => (n(p[key] as number) > n((best?.[key] as number) ?? -1) ? p : best), null);
    return top && n(top[key] as number) > 0 ? { labelEn, labelIs, name: top.name, team: top.team, value: n(top[key] as number) } : null;
  };
  const leaders = [
    leaderIn("pts", "Points", "Stig"), leaderIn("reb", "Rebounds", "Fráköst"), leaderIn("ast", "Assists", "Stoðsendingar"),
    leaderIn("stl", "Steals", "Stolnir"), leaderIn("blk", "Blocks", "Varin skot"),
  ].filter((x): x is NonNullable<typeof x> => x != null);

  return NextResponse.json({ ok: true, gameId, seasonId, teams: withFactors, quarters, advanced, leaders });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/basketball-games — the UNIFIED game list + merged single-game detail for a basketball team.
 * A game is ONE entity regardless of which source fed it; the sources complement each other:
 *   • box score + team totals  ← basketball_fiba_games (FIBA ingest + KKÍ saves)
 *   • shot chart (coords)       ← basketball_shots (FIBA)
 *   • Four Factors / quarters / advanced / zones ← InStat (basketball_team_match_stats, player_basketball_match_stats)
 * Games are matched across sources by (match_date, folded opponent). Current-season scoped. Four Factors
 * are computed from the box totals when InStat hasn't supplied them. Descriptive — never the readiness colour.
 *
 *   GET ?list=1       → the unified list (one row per game, with the layers it has)
 *   GET ?key=<key>    → the merged detail for one game (key = "<date>|<foldedOpponent>")
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { scopeToCurrentSeason, totalsPts, pctOf, type FibaGame, type FibaBoxRow } from "@/lib/micropulse/basketballStats/fibaGamesRead";
import { avgFactors } from "@/lib/micropulse/basketballStats/instatAggregate";

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const fold = (s: string | null | undefined): string => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
const gameKey = (date: string | null, opp: string | null) => `${date ?? "-"}|${fold(opp)}`;

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { supabase, teamId } as const;
}

type BoxP = { name: string; min: string | null; pts: number; reb: number; oreb: number; dreb: number; ast: number; stl: number; blk: number; tov: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; pm: number | null };
function mapBox(rows: FibaBoxRow[]): BoxP[] {
  return rows.map((b) => ({
    name: String(b.name ?? "—"), min: b.min == null ? null : String(b.min), pts: n(b.pts), reb: n(b.reb), oreb: n(b.oreb), dreb: n(b.dreb),
    ast: n(b.ast), stl: n(b.stl), blk: n(b.blk), tov: n(b.tov), fgm: n(b.fgm), fga: n(b.fga), tpm: n(b.tpm), tpa: n(b.tpa), ftm: n(b.ftm), fta: n(b.fta),
    pm: typeof b.pm === "number" ? b.pm : null,
  })).sort((a, b) => b.pts - a.pts);
}
/** InStat minutes are a decimal (e.g. 39.867) — render as "mm:ss" to match the KKÍ box. */
const minStr = (m: number | null | undefined): string | null =>
  m == null || !Number.isFinite(m) ? null : `${Math.floor(m)}:${String(Math.round((m - Math.floor(m)) * 60)).padStart(2, "0")}`;

type InstatP = { source_player_name?: string | null; minutes?: number | null; points?: number | null; fgm?: number | null; fga?: number | null; tpm?: number | null; tpa?: number | null; ftm?: number | null; fta?: number | null; oreb?: number | null; dreb?: number | null; reb?: number | null; assists?: number | null; steals?: number | null; blocks?: number | null; turnovers?: number | null; plus_minus?: number | null };
/** Own-side InStat per-player rows → the shared box shape. */
function instatBox(rows: InstatP[]): BoxP[] {
  return rows.map((r) => ({
    name: String(r.source_player_name ?? "—").trim(), min: minStr(r.minutes ?? null), pts: n(r.points), reb: n(r.reb), oreb: n(r.oreb), dreb: n(r.dreb),
    ast: n(r.assists), stl: n(r.steals), blk: n(r.blocks), tov: n(r.turnovers), fgm: n(r.fgm), fga: n(r.fga), tpm: n(r.tpm), tpa: n(r.tpa), ftm: n(r.ftm), fta: n(r.fta),
    pm: typeof r.plus_minus === "number" ? r.plus_minus : null,
  })).sort((a, b) => b.pts - a.pts);
}
/** Opponent side comes from the team row's advanced.opp_players (lean — no OREB/DREB split). */
function instatOppBox(rows: Array<Record<string, unknown>>): BoxP[] {
  return rows.map((r) => ({
    name: String(r.name ?? "—"), min: minStr(typeof r.minutes === "number" ? r.minutes : null), pts: n(r.points), reb: n(r.reb), oreb: 0, dreb: 0,
    ast: n(r.assists), stl: n(r.steals), blk: n(r.blocks), tov: n(r.turnovers), fgm: n(r.fgm), fga: n(r.fga), tpm: n(r.tpm), tpa: n(r.tpa), ftm: n(r.ftm), fta: n(r.fta),
    pm: null,
  })).sort((a, b) => b.pts - a.pts);
}
function totalsOf(box: BoxP[]) {
  const s = (k: keyof BoxP) => box.reduce((a, p) => a + (typeof p[k] === "number" ? (p[k] as number) : 0), 0);
  return { pts: s("pts"), reb: s("reb"), oreb: s("oreb"), dreb: s("dreb"), ast: s("ast"), stl: s("stl"), blk: s("blk"), tov: s("tov"), fgm: s("fgm"), fga: s("fga"), tpm: s("tpm"), tpa: s("tpa"), ftm: s("ftm"), fta: s("fta") };
}
type Totals = ReturnType<typeof totalsOf>;
function computeFactors(b: Totals, o: Totals) {
  return {
    efg: b.fga > 0 ? Math.round(((b.fgm + 0.5 * b.tpm) / b.fga) * 1000) / 10 : null,
    tovPct: b.fga + 0.44 * b.fta + b.tov > 0 ? Math.round((b.tov / (b.fga + 0.44 * b.fta + b.tov)) * 1000) / 10 : null,
    orebPct: b.oreb + o.dreb > 0 ? Math.round((b.oreb / (b.oreb + o.dreb)) * 1000) / 10 : null,
    ftRate: b.fga > 0 ? Math.round((b.ftm / b.fga) * 1000) / 10 : null,
    tp3: b.tpa > 0 ? Math.round((b.tpm / b.tpa) * 1000) / 10 : null,
  };
}

type FibaRow = FibaGame & { own_box: FibaBoxRow[] | null; opp_box: FibaBoxRow[] | null };

export async function GET(req: NextRequest) {
  const ctx = await authTeam(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;
  const sp = new URL(req.url).searchParams;

  const { data: fibaData } = await supabase.from("basketball_fiba_games")
    .select("match_id, match_date, own_name, opp_name, own_box, opp_box, own_totals, opp_totals, competition_code, season, runs")
    .eq("owner_team_id", teamId);
  const { season, games: fibaGames } = scopeToCurrentSeason(((fibaData ?? []) as Array<FibaRow & { runs?: unknown }>));

  // Which FIBA games have shot coords (numeric match_id in basketball_shots).
  const { data: shotRows } = await supabase.from("basketball_shots").select("match_id").eq("owner_team_id", teamId).eq("is_opponent", false);
  const shotMatchIds = new Set(((shotRows ?? []) as Array<{ match_id: string }>).map((r) => String(r.match_id)));

  // InStat games (if any) keyed by (date, folded opponent) — the "advanced" layer.
  const { data: instatGames } = await supabase.from("player_basketball_match_stats")
    .select("game_id, game_date, opponent").eq("team_id", teamId);
  const instatByKey = new Map<string, { gameId: string; date: string | null; opponent: string | null }>();
  for (const r of ((instatGames ?? []) as Array<{ game_id: string | null; game_date: string | null; opponent: string | null }>)) {
    const key = gameKey(r.game_date, r.opponent);
    if (!instatByKey.has(key)) instatByKey.set(key, { gameId: String(r.game_id ?? ""), date: r.game_date, opponent: r.opponent });
  }
  // Per-game InStat scores (own team points + summed opponent box) so an InStat-only game shows
  // a real score in the list, not 0–0.
  const { data: instatTeam } = await supabase.from("basketball_team_match_stats")
    .select("match_date, opponent, points, advanced").eq("owner_team_id", teamId).eq("source", "instat").eq("period", "game").eq("is_opponent", false);
  const instatPtsByKey = new Map<string, { own: number; opp: number }>();
  for (const r of ((instatTeam ?? []) as Array<{ match_date: string | null; opponent: string | null; points: number | null; advanced: { opp_players?: Array<{ points?: number | null }> } | null }>)) {
    const oppPts = Array.isArray(r.advanced?.opp_players) ? r.advanced!.opp_players!.reduce((a, p) => a + (Number(p?.points) || 0), 0) : 0;
    instatPtsByKey.set(gameKey(r.match_date, r.opponent), { own: Number(r.points) || 0, opp: oppPts });
  }

  // ── LIST ──
  if (sp.get("list")) {
    const seen = new Set<string>();
    const entries = fibaGames.map((g) => {
      const key = gameKey(g.match_date, g.opp_name);
      seen.add(key);
      const mid = String(g.match_id ?? "");
      return {
        key, date: g.match_date, opponent: g.opp_name ?? "—", own: g.own_name ?? "—",
        ownPts: totalsPts(g.own_totals) || totalsOf(mapBox(Array.isArray(g.own_box) ? g.own_box : [])).pts,
        oppPts: totalsPts(g.opp_totals), competition: g.competition_code ?? null,
        layers: { box: true, shots: shotMatchIds.has(mid), instat: instatByKey.has(key) },
      };
    });
    // InStat-only games (no FIBA/KKÍ box) — still list them.
    for (const [key, g] of instatByKey) {
      if (seen.has(key)) continue;
      const pts = instatPtsByKey.get(key);
      entries.push({ key, date: g.date, opponent: g.opponent ?? "—", own: "—", ownPts: pts?.own ?? 0, oppPts: pts?.opp ?? 0, competition: null, layers: { box: true, shots: false, instat: true } });
    }
    entries.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return NextResponse.json({ ok: true, season, games: entries });
  }

  // ── MERGED DETAIL ──
  const key = (sp.get("key") ?? "").trim();
  if (!key) return NextResponse.json({ ok: false, error: "key or list is required" }, { status: 400 });
  const g = fibaGames.find((x) => gameKey(x.match_date, x.opp_name) === key);
  const instat = instatByKey.get(key) ?? null;
  if (!g && !instat) return NextResponse.json({ ok: false, error: "Game not found." }, { status: 404 });

  const sources: string[] = [];
  let ownBox = g ? mapBox(Array.isArray(g.own_box) ? g.own_box : []) : [];
  let oppBox = g ? mapBox(Array.isArray(g.opp_box) ? g.opp_box : []) : [];
  if (g) sources.push(String(g.match_id ?? "").startsWith("kki-") ? "KKÍ" : "FIBA");

  // InStat box fallback — when no KKÍ/FIBA box exists for this game, build the per-player
  // box from the imported InStat rows (own from player_basketball_match_stats, opponent from
  // the team row's advanced.opp_players). This is what makes an InStat-only single-match
  // upload show its box, matching what KKÍ gives a non-InStat team.
  let instatOwnName: string | null = null;
  if (instat && ownBox.length === 0) {
    const { data: ownP } = await supabase.from("player_basketball_match_stats")
      .select("source_player_name, minutes, points, fgm, fga, tpm, tpa, ftm, fta, oreb, dreb, reb, assists, steals, blocks, turnovers, plus_minus")
      .eq("team_id", teamId).eq("source", "instat").eq("game_id", instat.gameId);
    ownBox = instatBox((ownP ?? []) as InstatP[]);
    const { data: teamAdv } = await supabase.from("basketball_team_match_stats")
      .select("advanced").eq("owner_team_id", teamId).eq("source", "instat").eq("period", "game").eq("is_opponent", false).eq("match_ref", instat.gameId).maybeSingle();
    const adv = (teamAdv as { advanced?: { opp_players?: unknown[]; opp_team?: string | null } } | null)?.advanced ?? {};
    oppBox = instatOppBox((adv.opp_players ?? []) as Array<Record<string, unknown>>);
    if (ownBox.length) sources.push("InStat");
    const { data: teamRow } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
    instatOwnName = (teamRow as { name?: string } | null)?.name ?? null;
  }

  const ownNameR = g?.own_name ?? instatOwnName ?? "—";
  const oppNameR = g?.opp_name ?? instat?.opponent ?? "—";
  const ownTotals = totalsOf(ownBox), oppTotals = totalsOf(oppBox);

  // Four Factors — InStat if imported for this game, else computed from the box totals.
  let fourFactors: { own: ReturnType<typeof computeFactors>; opp: ReturnType<typeof computeFactors>; source: "instat" | "computed" } | null = null;
  if (instat) {
    const { data: ff } = await supabase.from("basketball_team_match_stats")
      .select("is_opponent, efg_pct, to_pct, oreb_pct, ftf, ppp").eq("owner_team_id", teamId).eq("source", "instat").eq("period", "game").eq("match_ref", instat.gameId);
    const rows = (ff ?? []) as Array<Record<string, unknown>>;
    if (rows.length) {
      const own = avgFactors(rows.filter((r) => r.is_opponent === false));
      const opp = avgFactors(rows.filter((r) => r.is_opponent === true));
      fourFactors = {
        own: { efg: own.efgPct ?? null, tovPct: own.toPct ?? null, orebPct: own.orebPct ?? null, ftRate: own.ftf ?? null, tp3: null },
        opp: { efg: opp.efgPct ?? null, tovPct: opp.toPct ?? null, orebPct: opp.orebPct ?? null, ftRate: opp.ftf ?? null, tp3: null },
        source: "instat",
      };
      sources.push("InStat");
    }
  }
  if (!fourFactors && (ownTotals.fga > 0 || oppTotals.fga > 0)) {
    fourFactors = { own: computeFactors(ownTotals, oppTotals), opp: computeFactors(oppTotals, ownTotals), source: "computed" };
  }

  // Shot coords (FIBA), if this game has them.
  let shots: Array<{ x: number | null; y: number | null; made: boolean; isThree: boolean }> | null = null;
  const mid = g ? String(g.match_id ?? "") : "";
  if (mid && shotMatchIds.has(mid)) {
    const { data: sc } = await supabase.from("basketball_shots").select("x, y, result, action_type, action_number, tno")
      .eq("owner_team_id", teamId).eq("match_id", mid).eq("is_opponent", false).not("x", "is", null);
    const seen = new Set<string>();
    shots = [];
    for (const r of ((sc ?? []) as Array<Record<string, unknown>>)) {
      const k = `${r.tno}|${r.action_number}`; if (seen.has(k)) continue; seen.add(k);
      shots.push({ x: r.x as number | null, y: r.y as number | null, made: Number(r.result) === 1, isThree: String(r.action_type) === "3pt" });
    }
    if (shots.length) sources.push("Shot chart");
  }

  // Leaders across both teams (from the box).
  const all = [...ownBox.map((p) => ({ ...p, team: ownNameR })), ...oppBox.map((p) => ({ ...p, team: oppNameR }))];
  const leaderIn = (k: keyof BoxP, en: string, is: string) => {
    const top = all.reduce<(typeof all)[number] | null>((best, p) => (n(p[k]) > n((best?.[k] as number) ?? -1) ? p : best), null);
    return top && n(top[k]) > 0 ? { labelEn: en, labelIs: is, name: top.name, team: top.team, value: n(top[k]) } : null;
  };
  const leaders = [leaderIn("pts", "Points", "Stig"), leaderIn("reb", "Rebounds", "Fráköst"), leaderIn("ast", "Assists", "Stoðsendingar")].filter((x): x is NonNullable<typeof x> => x != null);

  // Full InStat per-player stats (all ~128 columns) for the "Show all stats" view — own from the
  // player rows, opponent from the team row's advanced.opp_players (present after a fresh upload).
  let allStats: { own: { name: string; stats: Record<string, unknown> }[]; opp: { name: string; stats: Record<string, unknown> }[] } | null = null;
  if (instat) {
    const { data: ownFull } = await supabase.from("player_basketball_match_stats")
      .select("source_player_name, stats").eq("team_id", teamId).eq("source", "instat").eq("game_id", instat.gameId);
    const { data: teamFull } = await supabase.from("basketball_team_match_stats")
      .select("advanced").eq("owner_team_id", teamId).eq("source", "instat").eq("period", "game").eq("is_opponent", false).eq("match_ref", instat.gameId).maybeSingle();
    const oppRaw = ((teamFull as { advanced?: { opp_players?: Array<{ name?: string; stats?: Record<string, unknown> }> } } | null)?.advanced?.opp_players ?? []);
    allStats = {
      own: ((ownFull ?? []) as Array<{ source_player_name: string | null; stats: Record<string, unknown> | null }>)
        .filter((r) => r.stats && Object.keys(r.stats).length).map((r) => ({ name: String(r.source_player_name ?? "—"), stats: r.stats as Record<string, unknown> })),
      opp: oppRaw.filter((p) => p?.stats && Object.keys(p.stats).length).map((p) => ({ name: String(p.name ?? "—"), stats: p.stats as Record<string, unknown> })),
    };
    if (!allStats.own.length && !allStats.opp.length) allStats = null;
  }

  return NextResponse.json({
    ok: true, key, date: g?.match_date ?? instat?.date ?? null,
    ownName: ownNameR, oppName: oppNameR,
    ownPts: ownTotals.pts || totalsPts(g?.own_totals), oppPts: oppTotals.pts || totalsPts(g?.opp_totals),
    competition: g?.competition_code ?? null,
    own: { box: ownBox, totals: ownTotals }, opp: { box: oppBox, totals: oppTotals },
    fourFactors, shots, leaders,
    pct: { ownFg: pctOf(ownTotals.fgm, ownTotals.fga), own3: pctOf(ownTotals.tpm, ownTotals.tpa), ownFt: pctOf(ownTotals.ftm, ownTotals.fta) },
    layers: { box: !!g, shots: !!(shots && shots.length), instat: !!instat },
    sources, allStats,
  });
}

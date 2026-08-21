export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * /api/coach/basketball-fiba
 *   POST { url, ownerSide? }  → fetch the FIBA LiveStats data.json for a game, parse the
 *                               shots, resolve our own players, store both sides, and return
 *                               the shot chart + per-player tendencies for immediate render.
 *   GET                       → list the games already pulled for this team.
 *   GET ?matchId=             → the stored shots + tendencies for one game (re-view).
 *
 * Free, public FIBA LiveStats (Genius Sports) feed — descriptive scouting only. NEVER
 * touches the readiness colour, the load, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { aggregateZones, resolveExpected } from "@/lib/micropulse/basketballStats/shotZones";
import { matchByInitialSurname } from "@/lib/micropulse/statsIngestion/nameMatch";
import type { SquadPlayer } from "@/lib/micropulse/statsIngestion/types";
import {
  extractMatchId, fibaDataUrl, parseFibaGame, playerTendencies,
  type FibaShot, type FibaGame, type FlowPoint, type RunAnalysis,
} from "@/lib/micropulse/basketballStats/fibaLiveStats";
import { aggregateAdvancedShots, zonesFromAdvanced, hasZones } from "@/lib/micropulse/basketballStats/instatAggregate";

const AI_MODEL = "claude-sonnet-5";
const AI_SYSTEM = `You are a basketball scout writing a DETAILED report on a team from ONE game's tracking data (FIBA LiveStats), for a head coach. When InStat play-type/shot-zone data is also given, weave it in.

Reason explicitly from the data given: the box score, the SHOT CONTEXT (share of made field goals in the paint / on the fast break / off turnovers / second chance), the ASSIST NETWORK (who feeds whom, and how many were threes), and each player's SHOOTING TENDENCIES (2s vs 3s and their top shot type — driving layup, pull-up jumper, step-back, etc.). If InStat is present, add the play types they rely on and their shot zones.

Hard rules:
- Use ONLY the numbers provided. Never invent players, stats or events. If something isn't given, omit it. It is ONE game — say so; don't over-generalise to a whole season.
- DESCRIPTIVE scouting, not a training prescription. No readiness/load talk.
- Be specific and cite the numbers ("48% of makes came in the paint", "Rodriguez and Dinkins feed each other, 3 assists each, mostly threes", "Dinkins 11-30, lives on the pull-up jumper").
- Expand jargon in a few words where useful.
- Write in the requested language ONLY.
- Return ONLY a JSON object (no markdown fence) with EXACTLY these keys:
  headline: string (one sentence — the single most important thing about this team in this game),
  summary: string (5-8 sentences — how they generated offence and what carried them),
  strengths: string[] (3-6, each with the number),
  weaknesses: string[] (3-6, each with the number),
  keyPlayers: Array<{ name: string, note: string }> (up to 5, with what they did + how to handle them),
  howToDefend: string[] (4-6 concrete keys tied to their tendencies),
  howToAttack: string[] (3-5 concrete places to attack them).`;

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

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");

/** Guess which FIBA side is our team by name; else null (coach can force via ownerSide). */
function detectOwnerTno(game: FibaGame, teamName: string | null): number | null {
  if (!teamName) return null;
  const want = norm(teamName);
  let best: { tno: number; score: number } | null = null;
  for (const t of game.teams) {
    const n = norm(t.name);
    const score = n === want ? 3 : n.includes(want) || want.includes(n) ? 2 : 0;
    if (score > 0 && (!best || score > best.score)) best = { tno: t.tno, score };
  }
  return best?.tno ?? null;
}

/** Resolve own-side shot players to the squad (initial+surname); returns name→playerId. */
async function resolveOwnPlayers(supabase: ReturnType<typeof getSupabase>, teamId: string, shots: FibaShot[]): Promise<Map<string, string>> {
  const { data: squadRows } = await supabase.from("players").select("id, full_name, is_active").eq("team_id", teamId);
  const squad: SquadPlayer[] = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ id: (p as { id: string }).id, fullName: (p as { full_name: string | null }).full_name ?? "—" }));
  const byName = new Map<string, string>();
  const distinct = new Set(shots.map((s) => s.playerName));
  for (const name of distinct) {
    const m = matchByInitialSurname(name, squad);
    if (m.playerId && m.confidence === "exact") byName.set(name, m.playerId);
  }
  return byName;
}

function chartPayload(game: FibaGame, ownerTno: number) {
  const own = game.shots.filter((s) => s.tno === ownerTno);
  const opp = game.shots.filter((s) => s.tno !== ownerTno && (s.tno === 1 || s.tno === 2));
  const ownTeam = game.teams.find((t) => t.tno === ownerTno) ?? null;
  const oppTeam = game.teams.find((t) => t.tno !== ownerTno) ?? null;
  return {
    ownerTno,
    ownTeam: ownTeam ? { tno: ownTeam.tno, name: ownTeam.name } : null,
    oppTeam: oppTeam ? { tno: oppTeam.tno, name: oppTeam.name } : null,
    own: { shots: own, tendencies: playerTendencies(own), box: game.players.filter((p) => p.tno === ownerTno), totals: game.totals.find((t) => t.tno === ownerTno) ?? null, pbp: game.pbp[ownerTno] ?? null },
    opp: { shots: opp, tendencies: playerTendencies(opp), box: game.players.filter((p) => p.tno !== ownerTno), totals: game.totals.find((t) => t.tno !== ownerTno) ?? null, pbp: game.pbp[ownerTno === 1 ? 2 : 1] ?? null },
    flow: game.flow,
    runs: game.runs,
  };
}

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { supabase, teamId } = auth;
  const matchId = (new URL(req.url).searchParams.get("matchId") ?? "").trim();

  if (matchId) {
    const { data } = await supabase.from("basketball_shots").select("*").eq("owner_team_id", teamId).eq("match_id", matchId);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (!rows.length) return NextResponse.json({ ok: true, found: false });
    const toShot = (r: Record<string, unknown>): FibaShot => ({
      tno: Number(r.tno), playerNo: (r.player_no as number) ?? null, pno: (r.player_pno as number) ?? null,
      playerName: (r.player_name as string) ?? "—", shirt: (r.shirt_number as string) ?? null,
      x: r.x == null ? null : Number(r.x), y: r.y == null ? null : Number(r.y),
      result: r.result === 1 ? 1 : r.result === 0 ? 0 : null, actionType: (r.action_type as string) ?? null,
      subType: (r.sub_type as string) ?? null, period: (r.period as number) ?? null, actionNumber: (r.action_number as number) ?? null,
    });
    const ownRows = rows.filter((r) => r.is_opponent === false);
    const oppRows = rows.filter((r) => r.is_opponent === true);
    const ownName = (ownRows[0]?.team_name as string) ?? null;
    const oppName = (oppRows[0]?.team_name as string) ?? null;
    // Box + team totals (stored on the pull) — the descriptive layer.
    const { data: g } = await supabase.from("basketball_fiba_games")
      .select("own_totals, opp_totals, own_box, opp_box, own_pbp, opp_pbp, own_ai, opp_ai").eq("owner_team_id", teamId).eq("match_id", matchId).maybeSingle();
    const gg = (g ?? {}) as Record<string, unknown>;
    const ownerTno = Number(ownRows[0]?.tno) || 1;
    // Best-effort: re-fetch the live feed for the game-flow chart + run stats (not stored).
    let flow: FlowPoint[] = [];
    let runs: RunAnalysis | null = null;
    let ownTotals = gg.own_totals ?? null;
    let oppTotals = gg.opp_totals ?? null;
    try {
      const fr = await fetch(fibaDataUrl(matchId), { headers: { "User-Agent": "MicroPulse/1.0", Accept: "application/json" }, cache: "no-store" });
      if (fr.ok) {
        const fresh = parseFibaGame(await fr.json());
        flow = fresh.flow;
        runs = fresh.runs;
        const ot = fresh.totals.find((t) => t.tno === ownerTno);
        const pt = fresh.totals.find((t) => t.tno !== ownerTno);
        if (ot) ownTotals = { ...(typeof ownTotals === "object" && ownTotals ? ownTotals : {}), ...ot };
        if (pt) oppTotals = { ...(typeof oppTotals === "object" && oppTotals ? oppTotals : {}), ...pt };
      }
    } catch { /* keep stored totals; no flow */ }
    return NextResponse.json({
      ok: true, found: true, matchId, ownerTno,
      ownTeam: ownName ? { name: ownName } : null, oppTeam: oppName ? { name: oppName } : null,
      own: { shots: ownRows.map(toShot), tendencies: playerTendencies(ownRows.map(toShot)), box: gg.own_box ?? [], totals: ownTotals, pbp: gg.own_pbp ?? null, ai: gg.own_ai ?? null },
      opp: { shots: oppRows.map(toShot), tendencies: playerTendencies(oppRows.map(toShot)), box: gg.opp_box ?? [], totals: oppTotals, pbp: gg.opp_pbp ?? null, ai: gg.opp_ai ?? null },
      flow, runs,
    });
  }

  // List pulled games.
  const { data } = await supabase.from("basketball_shots")
    .select("match_id, team_name, is_opponent, synced_at").eq("owner_team_id", teamId);
  const games = new Map<string, { matchId: string; own: string | null; opp: string | null; shots: number; syncedAt: string | null }>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const mid = String(r.match_id);
    const g = games.get(mid) ?? { matchId: mid, own: null, opp: null, shots: 0, syncedAt: null };
    g.shots += 1;
    if (r.is_opponent === false) g.own = (r.team_name as string) ?? g.own; else g.opp = (r.team_name as string) ?? g.opp;
    g.syncedAt = (r.synced_at as string) ?? g.syncedAt;
    games.set(mid, g);
  }
  // League baseline — expected FG% per zone from ALL ingested FIBA shots (across teams,
  // deduped), used for relative shading. Falls back to built-in defaults until the DB is
  // big enough (resolveExpected gates on sample). Aggregate of public data — no PII.
  let leagueExpected: Record<string, number> | undefined;
  let leagueZones: string[] | undefined;
  try {
    const admin = getSupabaseAdmin();
    const { data: allShots } = await admin.from("basketball_shots")
      .select("match_id, tno, action_number, x, y, action_type, result")
      .eq("source", "fibalivestats").not("x", "is", null).in("result", [0, 1]).limit(20000);
    const seen = new Set<string>();
    const shots: Array<{ x: number | null; y: number | null; isThree: boolean; made: boolean }> = [];
    for (const s of (allShots ?? []) as Array<Record<string, unknown>>) {
      const key = `${s.match_id}|${s.tno}|${s.action_number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      shots.push({ x: s.x as number | null, y: s.y as number | null, isThree: String(s.action_type) === "3pt", made: Number(s.result) === 1 });
    }
    const resolved = resolveExpected(aggregateZones(shots));
    leagueExpected = resolved.expected;
    leagueZones = resolved.leagueZones;
  } catch { /* fall back to built-in baselines on the client */ }

  return NextResponse.json({ ok: true, games: [...games.values()].sort((a, b) => String(b.syncedAt).localeCompare(String(a.syncedAt))), leagueExpected, leagueZones });
}

type IngestResult =
  | { ok: true; matchId: string; game: FibaGame; ownerTno: number; ownName: string | null; oppName: string | null; rowsUpserted: number; mappedOwnPlayers: number }
  | { ok: false; matchId: string | null; error: string };

/** Fetch one FIBA game, resolve our players, store both sides. Shared by single + batch. */
async function ingestGame(supabase: ReturnType<typeof getSupabase>, teamId: string, teamName: string | null, url: string, ownerSide?: number): Promise<IngestResult> {
  const matchId = extractMatchId(String(url ?? ""));
  if (!matchId) return { ok: false, matchId: null, error: "No FIBA LiveStats match id in that URL." };

  let json: unknown;
  try {
    const res = await fetch(fibaDataUrl(matchId), { headers: { "User-Agent": "MicroPulse/1.0", Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return { ok: false, matchId, error: `fetch failed (${res.status})` };
    json = await res.json();
  } catch (e) {
    return { ok: false, matchId, error: `unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }

  const game = parseFibaGame(json);
  if (game.shots.length === 0) return { ok: false, matchId, error: "no shots in the feed yet" };

  // Coach override wins, else name-match, else default to team 1.
  const ownerTno = (ownerSide === 1 || ownerSide === 2) ? ownerSide : (detectOwnerTno(game, teamName) ?? game.teams[0]?.tno ?? 1);
  const ownName = game.teams.find((t) => t.tno === ownerTno)?.name ?? null;
  const oppName = game.teams.find((t) => t.tno !== ownerTno)?.name ?? null;
  const ownPlayerIds = await resolveOwnPlayers(supabase, teamId, game.shots.filter((s) => s.tno === ownerTno));

  const rows = game.shots.map((s) => ({
    owner_team_id: teamId, source: "fibalivestats", match_id: matchId,
    tno: s.tno, is_opponent: s.tno !== ownerTno,
    team_name: s.tno === ownerTno ? ownName : oppName,
    player_no: s.playerNo, player_pno: s.pno, player_name: s.playerName, shirt_number: s.shirt,
    player_id: s.tno === ownerTno ? (ownPlayerIds.get(s.playerName) ?? null) : null,
    x: s.x, y: s.y, result: s.result, action_type: s.actionType, sub_type: s.subType,
    period: s.period, action_number: s.actionNumber, synced_at: new Date().toISOString(),
  })).filter((r) => r.action_number != null); // drop rows without a stable dedupe key (rare)

  const { error } = await supabase.from("basketball_shots").upsert(rows as never, { onConflict: "owner_team_id,source,match_id,tno,action_number" });
  if (error) return { ok: false, matchId, error: `save failed: ${error.message}` };

  // Persist the box + team scoring breakdown (both sides) so the full descriptive read
  // survives a re-open — its own table, no collision with the InStat/KKÍ Four Factors.
  await supabase.from("basketball_fiba_games").upsert({
    owner_team_id: teamId, match_id: matchId, own_tno: ownerTno, own_name: ownName, opp_name: oppName,
    own_totals: game.totals.find((t) => t.tno === ownerTno) ?? {}, opp_totals: game.totals.find((t) => t.tno !== ownerTno) ?? {},
    own_box: game.players.filter((p) => p.tno === ownerTno), opp_box: game.players.filter((p) => p.tno !== ownerTno),
    own_pbp: game.pbp[ownerTno] ?? {}, opp_pbp: game.pbp[ownerTno === 1 ? 2 : 1] ?? {},
    synced_at: new Date().toISOString(),
  } as never, { onConflict: "owner_team_id,match_id" });

  return { ok: true, matchId, game, ownerTno, ownName, oppName, rowsUpserted: rows.length, mappedOwnPlayers: ownPlayerIds.size };
}

const MAX_BATCH = 40;

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { supabase, teamId } = auth;

  let body: { url?: string; urls?: string[]; ownerSide?: number; ai?: boolean; matchId?: string; side?: "own" | "opp"; lang?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Expected JSON body" }, { status: 400 }); }

  // ── AI scouting report for one stored game side (rules assemble facts; the model narrates). ──
  if (body.ai) {
    const matchId = String(body.matchId ?? "").trim();
    const side = body.side === "own" ? "own" : "opp";
    if (!matchId) return NextResponse.json({ ok: false, error: "matchId is required" }, { status: 400 });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: false, error: "AI report unavailable (no API key configured)." }, { status: 503 });
    const lang = String(body.lang ?? "EN").toUpperCase() === "IS" ? "Icelandic" : "English";

    const { data: gRow } = await supabase.from("basketball_fiba_games").select("*").eq("owner_team_id", teamId).eq("match_id", matchId).maybeSingle();
    if (!gRow) return NextResponse.json({ ok: false, error: "Pull this game first." }, { status: 400 });
    const g = gRow as Record<string, unknown>;
    const isOpp = side === "opp";
    const teamNm = (isOpp ? g.opp_name : g.own_name) as string | null;
    const box = (isOpp ? g.opp_box : g.own_box) as unknown[];
    const totals = (isOpp ? g.opp_totals : g.own_totals) as Record<string, unknown>;
    const pbp = (isOpp ? g.opp_pbp : g.own_pbp) as { assists?: unknown[]; context?: unknown } | null;
    const ownTno = Number(g.own_tno ?? 1);
    const sideTno = isOpp ? (ownTno === 1 ? 2 : 1) : ownTno;

    const { data: shotRows } = await supabase.from("basketball_shots").select("*")
      .eq("owner_team_id", teamId).eq("match_id", matchId).eq("tno", sideTno);
    const tendencies = playerTendencies(((shotRows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      tno: Number(r.tno), playerNo: null, pno: null, playerName: (r.player_name as string) ?? "—", shirt: (r.shirt_number as string) ?? null,
      x: null, y: null, result: r.result === 1 ? 1 : r.result === 0 ? 0 : null, actionType: (r.action_type as string) ?? null, subType: (r.sub_type as string) ?? null, period: null, actionNumber: null,
    }))).slice(0, 8).map((t) => ({ name: t.name, fg: `${t.fgm}-${t.fga}`, twoPt: `${t.twoM}-${t.twoA}`, threePt: `${t.tpm}-${t.tpa}`, topShotType: t.byType[0]?.type ?? null }));

    // InStat play-types + zones (own team, season) — folded in when present.
    let instat: unknown = null;
    if (!isOpp) {
      const { data: adv } = await supabase.from("basketball_team_match_stats").select("advanced")
        .eq("owner_team_id", teamId).eq("period", "game").eq("source", "instat").eq("is_opponent", false);
      const advRows = (adv ?? []) as Array<{ advanced: Record<string, unknown> | null }>;
      const { data: zoneRows } = await supabase.from("player_basketball_match_stats").select("advanced").eq("team_id", teamId).eq("source", "instat");
      const zr = ((zoneRows ?? []) as Array<{ advanced: Record<string, unknown> | null }>).filter((r) => hasZones(r.advanced));
      if (advRows.length || zr.length) instat = {
        playtypes: aggregateAdvancedShots(advRows, "pt"), efficiencyTypes: aggregateAdvancedShots(advRows, "eff"),
        shotZones: zr.length ? zonesFromAdvanced(zr.map((r) => r.advanced ?? {})) : [],
      };
    }

    const facts = {
      team: teamNm, oneGame: true, opponentInGame: (isOpp ? g.own_name : g.opp_name),
      teamTotals: totals, shotContext: pbp?.context ?? null, assistNetwork: (pbp?.assists ?? []).slice(0, 10),
      topPlayers: (box ?? []).slice(0, 8), shootingTendencies: tendencies, instat,
    };

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: AI_MODEL, max_tokens: 3000, thinking: { type: "disabled" }, system: AI_SYSTEM, messages: [{ role: "user", content: `Write the report in ${lang}. Here is the team's game data (JSON):\n\n${JSON.stringify(facts)}` }] }),
      });
    } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "AI request failed." }, { status: 502 }); }
    if (!res.ok) { const d = await res.text().catch(() => ""); return NextResponse.json({ ok: false, error: `AI report failed (${res.status}). ${d.slice(0, 200)}` }, { status: 502 }); }
    const j = await res.json();
    let txt = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
    txt = a >= 0 && b > a ? txt.slice(a, b + 1) : txt;
    let summary: Record<string, unknown> | null = null;
    try { summary = JSON.parse(txt); } catch { summary = null; }
    if (!summary) return NextResponse.json({ ok: false, error: "The model didn't return a readable report — try again." }, { status: 422 });
    await supabase.from("basketball_fiba_games").update({ [isOpp ? "opp_ai" : "own_ai"]: summary, ai_model: AI_MODEL, ai_generated_at: new Date().toISOString() }).eq("owner_team_id", teamId).eq("match_id", matchId);
    return NextResponse.json({ ok: true, ai: summary, model: AI_MODEL });
  }

  const { data: teamRow } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
  const teamName = (teamRow as { name?: string } | null)?.name ?? null;

  // ── Batch: pull many games in one call (a season in one paste). ──
  if (Array.isArray(body.urls) && body.urls.length > 0) {
    const urls = [...new Set(body.urls.map((u) => String(u).trim()).filter(Boolean))].slice(0, MAX_BATCH);
    const results: Array<{ matchId: string | null; ok: boolean; error?: string; own?: string | null; opp?: string | null; ownShots?: number; oppShots?: number }> = [];
    for (const url of urls) {
      const r = await ingestGame(supabase, teamId, teamName, url);   // sequential — kind to the feed
      results.push(r.ok
        ? { matchId: r.matchId, ok: true, own: r.ownName, opp: r.oppName, ownShots: r.game.shots.filter((s) => s.tno === r.ownerTno).length, oppShots: r.game.shots.filter((s) => s.tno !== r.ownerTno).length }
        : { matchId: r.matchId, ok: false, error: r.error });
    }
    return NextResponse.json({
      ok: true, batch: true,
      requested: body.urls.length, processed: results.length, capped: body.urls.length > MAX_BATCH ? MAX_BATCH : null,
      imported: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length,
      results,
    });
  }

  // ── Single: pull one game and return its chart payload for immediate render. ──
  const r = await ingestGame(supabase, teamId, teamName, String(body.url ?? ""), body.ownerSide);
  if (!r.ok) {
    const status = r.matchId == null ? 400 : r.error.startsWith("unreachable") ? 502 : 400;
    return NextResponse.json({ ok: false, error: r.error }, { status });
  }
  return NextResponse.json({ ok: true, matchId: r.matchId, rowsUpserted: r.rowsUpserted, mappedOwnPlayers: r.mappedOwnPlayers, ...chartPayload(r.game, r.ownerTno) });
}

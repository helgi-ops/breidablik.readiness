export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * /api/coach/basketball-match-insights — the SINGLE-GAME InStat read for basketball.
 *
 *   GET  (no ?gameId)   → the list of imported InStat games for the picker.
 *   GET  ?gameId=<ref>  → that one game: team box, Four Factors, per-quarter, FG-playtype
 *                         + efficiency mix, shot zones, lineups, opponent players, and any
 *                         saved AI summary.
 *   POST { gameId }     → generate a detailed AI briefing FROM the stored InStat numbers
 *                         (not a PDF): how the game went, which factors decided it, key
 *                         players, opponent threats, takeaways. Saved on the own game row.
 *
 * Reuses the same pure aggregation as the season read (instatAggregate). AI is labelled
 * as AI and cites the numbers; it DECIDES nothing. Descriptive — never touches the
 * readiness colour, load, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import {
  avgFactors, aggregateAdvancedShots, zonesFromAdvanced, playerZonesFromRows, hasZones,
} from "@/lib/micropulse/basketballStats/instatAggregate";

const AI_MODEL = "claude-sonnet-5";

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

type TeamRow = { match_ref: string; match_date: string | null; opponent: string | null; is_opponent: boolean; period: string; points: number | null; stats: Record<string, unknown> | null; advanced: Record<string, unknown> | null } & Record<string, unknown>;

/** List of imported InStat games (own-side game rows), paired with opponent points. */
async function loadGamesList(supabase: ReturnType<typeof getSupabase>, teamId: string) {
  const { data } = await supabase.from("basketball_team_match_stats")
    .select("match_ref, match_date, opponent, is_opponent, points")
    .eq("owner_team_id", teamId).eq("source", "instat").eq("period", "game");
  const rows = (data ?? []) as Array<{ match_ref: string; match_date: string | null; opponent: string | null; is_opponent: boolean; points: number | null }>;
  const byRef = new Map<string, { matchRef: string; date: string | null; opponent: string | null; ownPoints: number | null; oppPoints: number | null }>();
  for (const r of rows) {
    const g = byRef.get(r.match_ref) ?? { matchRef: r.match_ref, date: r.match_date, opponent: r.opponent, ownPoints: null, oppPoints: null };
    if (r.is_opponent) g.oppPoints = r.points; else { g.ownPoints = r.points; g.opponent = r.opponent ?? g.opponent; g.date = r.match_date ?? g.date; }
    byRef.set(r.match_ref, g);
  }
  return [...byRef.values()].sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
}

type OwnPlayer = { name: string; minutes: number | null; points: number | null; fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null };

/** Load + assemble one game's structured InStat read. Returns null when not found. */
async function loadSingleGame(supabase: ReturnType<typeof getSupabase>, teamId: string, gameId: string) {
  const { data: teamData } = await supabase.from("basketball_team_match_stats")
    .select("match_ref, match_date, opponent, is_opponent, period, points, efg_pct, to_pct, oreb_pct, ftf, ppp, stats, advanced")
    .eq("owner_team_id", teamId).eq("source", "instat").eq("match_ref", gameId);
  const teamRows = (teamData ?? []) as TeamRow[];
  if (teamRows.length === 0) return null;

  const ownGame = teamRows.find((r) => r.period === "game" && r.is_opponent === false) ?? null;
  const oppGame = teamRows.find((r) => r.period === "game" && r.is_opponent === true) ?? null;
  const ownName = (ownGame?.stats as { teamName?: string } | null)?.teamName ?? null;

  const fourFactors = ownGame || oppGame ? {
    own: avgFactors(ownGame ? [ownGame] : []),
    opp: avgFactors(oppGame ? [oppGame] : []),
  } : null;

  const qPoints = (isOpp: boolean) => (["q1", "q2", "q3", "q4"] as const).map((p) => {
    const row = teamRows.find((r) => r.period === p && r.is_opponent === isOpp);
    return typeof row?.points === "number" ? row.points : null;
  });
  const hasQuarters = teamRows.some((r) => ["q1", "q2", "q3", "q4"].includes(r.period));
  const quarters = hasQuarters ? { own: qPoints(false), opp: qPoints(true), games: 1 } : null;

  const ownAdv = ownGame ? [{ advanced: ownGame.advanced }] : [];
  const playtypes = aggregateAdvancedShots(ownAdv, "pt");
  const efficiency = aggregateAdvancedShots(ownAdv, "eff");
  const tacticalShots = playtypes.length || efficiency.length ? { playtypes, efficiency, games: 1 } : null;

  const ownAdvJson = (ownGame?.advanced ?? {}) as { lineups?: unknown; opp_players?: unknown; opp_team?: unknown; ai_summary?: unknown; court_regions?: unknown; opp_court_regions?: unknown };
  const lineups = Array.isArray(ownAdvJson.lineups) ? ownAdvJson.lineups : null;
  const oppPlayers = Array.isArray(ownAdvJson.opp_players)
    ? { team: typeof ownAdvJson.opp_team === "string" ? ownAdvJson.opp_team : null, players: ownAdvJson.opp_players }
    : null;
  const courtRegions = Array.isArray(ownAdvJson.court_regions) ? ownAdvJson.court_regions : null;
  const oppCourtRegions = Array.isArray(ownAdvJson.opp_court_regions) ? ownAdvJson.opp_court_regions : null;
  const aiSummary = ownAdvJson.ai_summary && typeof ownAdvJson.ai_summary === "object" ? ownAdvJson.ai_summary : null;

  const { data: playerData } = await supabase.from("player_basketball_match_stats")
    .select("source_player_name, points, fgm, fga, tpm, tpa, advanced")
    .eq("team_id", teamId).eq("source", "instat").eq("game_id", gameId);
  const allPlayerRows = (playerData ?? []) as Array<{ source_player_name: string | null; points: number | null; fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null; advanced: Record<string, unknown> | null }>;
  const zoneRows = allPlayerRows.filter((r) => hasZones(r.advanced));
  const shotZones = zoneRows.length ? {
    team: zonesFromAdvanced(zoneRows.map((r) => r.advanced ?? {})),
    players: playerZonesFromRows(zoneRows.map((r) => ({ source_player_name: r.source_player_name, advanced: r.advanced }))),
    games: 1,
  } : null;
  const ownPlayers: OwnPlayer[] = allPlayerRows
    .map((r) => ({ name: (r.source_player_name ?? "—").trim(), minutes: null, points: r.points, fgm: r.fgm, fga: r.fga, tpm: r.tpm, tpa: r.tpa }))
    .filter((p) => (p.points ?? 0) > 0 || (p.fga ?? 0) > 0)
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  const payload = {
    match: {
      matchRef: gameId,
      date: ownGame?.match_date ?? oppGame?.match_date ?? null,
      opponent: ownGame?.opponent ?? null,
      ownName,
      ownPoints: ownGame?.points ?? null,
      oppPoints: oppGame?.points ?? null,
    },
    fourFactors, quarters, tacticalShots, shotZones, lineups, oppPlayers, courtRegions, oppCourtRegions,
  };
  return { payload, ownGame, ownName, ownPlayers, aiSummary };
}

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const gameId = new URL(req.url).searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ ok: true, games: await loadGamesList(auth.supabase, auth.teamId) });

  const game = await loadSingleGame(auth.supabase, auth.teamId, gameId);
  if (!game) return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...game.payload, aiSummary: game.aiSummary });
}

const AI_SYSTEM = `You are a basketball analyst writing a DETAILED plain-language briefing of ONE game for a head coach, from the InStat numbers you are given (not from a PDF). Centre it on the coach's OWN team ("we / our team", named in the input as "us"); the other team is the opponent.

Your job: explain how the game went and — most importantly — WHICH FACTORS MOST INFLUENCED THE RESULT. Reason explicitly from the data: the Four Factors (eFG%, TO%, OREB%, FTF, PPP) vs the opponent, the quarter-by-quarter swings, the FG playtypes and offensive-efficiency types (which actions we scored efficiently vs poorly on), shot zones (where our shots came from and how they fell), our key players and the opponent's dangermen, and lineup net +/-.

Hard rules:
- Use ONLY the numbers provided. Never invent players, stats or events. If something isn't given, omit it.
- DESCRIPTIVE and analytical, not prescriptive: explain what happened and what drove it. No training prescription, no readiness/load talk.
- Be specific and cite the numbers ("we won the eFG battle 56.1% to 57.1%… actually LOST it", "our transition play went 6-9 / 66.7%", "Baskonia's Luwawu-Cabarrot led all scorers with 19"). Get the direction right — compare us vs them correctly.
- Expand jargon in a few words where useful (eFG% = shooting that credits the extra point of a three; PPP = points per possession; FTF = free-throw factor).
- It can be long and thorough — the coach asked for detail.
- Write in the requested language ONLY.
- Return ONLY a JSON object (no markdown fence) with EXACTLY these keys:
  headline: string (one sentence — the single biggest reason for the result),
  result: string (e.g. "Valencia BC 86 - 88 Bitci Baskonia"),
  summary: string (5-8 sentences — the full story of the game),
  decisiveFactors: Array<{ factor: string, detail: string }> (4-8 items — THE key drivers of the result, each naming the metric + the number + why it mattered; ranked most decisive first),
  quarterFlow: string (3-5 sentences — how the game swung quarter by quarter, with the numbers),
  keyPlayers: Array<{ name: string, note: string }> (our standouts, up to 5, with their line),
  opponentThreats: Array<{ name: string, note: string }> (the opponent's dangermen, up to 5, with their line),
  takeaways: string[] (4-6 short analytical takeaways about what won/lost us this game).`;

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI summary unavailable (no API key configured)." }, { status: 503 });

  let body: { gameId?: string; lang?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Expected JSON body" }, { status: 400 }); }
  const gameId = String(body.gameId ?? "").trim();
  if (!gameId) return NextResponse.json({ ok: false, error: "gameId is required" }, { status: 400 });
  const lang = String(body.lang ?? "EN").toUpperCase() === "IS" ? "Icelandic" : "English";

  const game = await loadSingleGame(auth.supabase, auth.teamId, gameId);
  if (!game || !game.ownGame) return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });

  const us = game.ownName ?? "our team";
  const them = game.payload.match.opponent ?? "the opponent";
  const facts = {
    us, them,
    score: { us: game.payload.match.ownPoints, them: game.payload.match.oppPoints },
    date: game.payload.match.date,
    quarters: game.payload.quarters ? { us: game.payload.quarters.own, them: game.payload.quarters.opp } : null,
    fourFactors: game.payload.fourFactors ? { us: game.payload.fourFactors.own, them: game.payload.fourFactors.opp } : null,
    playtypes: game.payload.tacticalShots?.playtypes ?? [],
    efficiencyTypes: game.payload.tacticalShots?.efficiency ?? [],
    shotZones: game.payload.shotZones?.team ?? [],
    ourPlayers: game.ownPlayers.slice(0, 12),
    opponentPlayers: (game.payload.oppPlayers?.players ?? []).slice(0, 12),
    lineups: (game.payload.lineups ?? []).slice(0, 10),
  };

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: AI_MODEL, max_tokens: 3000, thinking: { type: "disabled" }, system: AI_SYSTEM,
        messages: [{ role: "user", content: `Write the briefing in ${lang}. Here is the game's InStat data (JSON):\n\n${JSON.stringify(facts)}` }],
      }),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "AI request failed." }, { status: 502 });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ ok: false, error: `AI summary failed (${res.status}). ${detail.slice(0, 200)}` }, { status: 502 });
  }

  const j = await res.json();
  let text = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  text = a >= 0 && b > a ? text.slice(a, b + 1) : text;
  let summary: Record<string, unknown> | null = null;
  try { summary = JSON.parse(text); } catch { summary = null; }
  if (!summary) return NextResponse.json({ ok: false, error: "The model didn't return a readable summary — try again." }, { status: 422 });

  // Persist on the own full-game row's advanced jsonb, so a revisit needs no re-run.
  const advanced = { ...(game.ownGame.advanced ?? {}), ai_summary: summary, ai_generated_at: new Date().toISOString(), ai_model: AI_MODEL };
  await auth.supabase.from("basketball_team_match_stats")
    .update({ advanced })
    .eq("owner_team_id", auth.teamId).eq("source", "instat").eq("match_ref", gameId).eq("period", "game").eq("is_opponent", false);

  return NextResponse.json({ ok: true, aiSummary: summary, model: AI_MODEL });
}

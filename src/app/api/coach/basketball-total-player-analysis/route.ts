export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/basketball-total-player-analysis
 *   GET  ?list=1    → the squad's players with game data, for the picker.
 *   POST { player, prose? } → the player's TWO-axis read: PRODUCTION (within-squad box-score
 *                             percentiles) + STYLE (InStat play-type mix + defence) + an
 *                             archetype, optionally an AI narrative. Reads what Single/Season
 *                             Match Analysis already ingested — no upload.
 *
 * Descriptive scouting — never touches the readiness colour, load, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { scopeToCurrentSeason, type FibaGame, type FibaBoxRow } from "@/lib/micropulse/basketballStats/fibaGamesRead";
import { initialSurnameKey } from "@/lib/micropulse/statsIngestion/nameMatch";
import { aggregatePlayers, buildBasketballPlayerAnalysis, type BoxLine, type PlayerSeason, type PlayerAnalysis } from "@/lib/micropulse/basketballStats/basketballPlayerAnalysis";
import { buildPlayStyle, archetype, type PlayStyle } from "@/lib/micropulse/basketballStats/basketballPlayStyle";

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

const foldNm = (s: string | null | undefined) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const gkey = (date: string | null, opp: string | null) => `${date ?? "-"}|${foldNm(opp)}`;

/** Per-player season aggregates from the merged box (InStat rows + current-season KKÍ box). */
async function loadSquadSeasons(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<PlayerSeason[]> {
  const { data: prows } = await supabase.from("player_basketball_match_stats")
    .select("game_date, opponent, source_player_name, points, reb, oreb, dreb, assists, steals, blocks, turnovers, fgm, fga, tpm, tpa, ftm, fta")
    .eq("team_id", teamId);
  const lines: BoxLine[] = [];
  const covered = new Set<string>();
  for (const r of ((prows ?? []) as Array<Record<string, unknown>>)) {
    covered.add(gkey(r.game_date as string | null, r.opponent as string | null));
    lines.push({ name: String(r.source_player_name ?? ""), pts: r.points as number, reb: r.reb as number, oreb: r.oreb as number, dreb: r.dreb as number, ast: r.assists as number, stl: r.steals as number, blk: r.blocks as number, tov: r.turnovers as number, fgm: r.fgm as number, fga: r.fga as number, tpm: r.tpm as number, tpa: r.tpa as number, ftm: r.ftm as number, fta: r.fta as number });
  }
  const { data: fiba } = await supabase.from("basketball_fiba_games").select("match_id, match_date, opp_name, own_box, season").eq("owner_team_id", teamId);
  const { games } = scopeToCurrentSeason(((fiba ?? []) as FibaGame[]));
  for (const g of games) {
    if (covered.has(gkey(g.match_date, g.opp_name))) continue;
    for (const b of ((Array.isArray(g.own_box) ? g.own_box : []) as FibaBoxRow[])) {
      lines.push({ name: String(b.name ?? ""), pts: b.pts, reb: b.reb, oreb: b.oreb, dreb: b.dreb, ast: b.ast, stl: b.stl, blk: b.blk, tov: b.tov, fgm: b.fgm, fga: b.fga, tpm: b.tpm, tpa: b.tpa, ftm: b.ftm, fta: b.fta });
    }
  }
  return aggregatePlayers(lines, initialSurnameKey);
}

/** A player's InStat per-game stats rows (the ~128-col bags) for the play-type / defence read. */
async function loadStyleRows(supabase: ReturnType<typeof getSupabase>, teamId: string, player: string): Promise<Array<Record<string, unknown>>> {
  const { data } = await supabase.from("player_basketball_match_stats").select("source_player_name, stats").eq("team_id", teamId).eq("source", "instat");
  const k = initialSurnameKey(player);
  return ((data ?? []) as Array<{ source_player_name: string | null; stats: Record<string, unknown> | null }>)
    .filter((r) => r.stats && initialSurnameKey(String(r.source_player_name ?? "")) === k)
    .map((r) => r.stats as Record<string, unknown>);
}

/** Pull the percentiles the archetype rules look at out of the production analysis. */
function productionLite(a: PlayerAnalysis) {
  const cells = a.categories.flatMap((c) => c.metrics);
  const pc = (k: string) => cells.find((m) => m.key === k)?.percentile ?? null;
  return { role: a.role, percentileOf: { ppg: pc("ppg"), apg: pc("apg"), rpg: pc("rpg"), spg: pc("spg"), bpg: pc("bpg"), tpPct: pc("tpPct"), tsPct: pc("tsPct") } };
}

const AI_MODEL = "claude-haiku-4-5-20251001";
async function narrative(a: PlayerAnalysis, style: PlayStyle | null, arch: { label: { en: string; is: string } }, lang: "EN" | "IS"): Promise<{ summary: string; development: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) return null;
  const language = lang === "IS" ? "Icelandic" : "English";
  const facts = {
    name: a.name, games: a.games, archetype: arch.label.en, role: a.role?.key ?? null, season: a.season,
    strengths: a.strengths.map((m) => ({ metric: m.key, percentile: m.percentile })),
    weaknesses: a.weaknesses.map((m) => ({ metric: m.key, percentile: m.percentile })),
    styleMix: (style?.mix ?? []).slice(0, 4).map((s) => ({ type: s.key, sharePct: s.share, pct: s.pct })),
    defenseOppFgPct: style?.defense?.oppFgPct ?? null,
  };
  const system = `You are a basketball analyst writing a SHORT two-axis player read for a head coach: PRODUCTION (within-squad box-score percentiles, 0-100) + STYLE (how they generate offence, by attempt share) + a defence number. Use ONLY the numbers given; never invent stats or events; refer to the player by name or "they"/"them" (do not guess gender); tie the archetype to the style mix and the top strengths; plain language; PERFORMANCE read only, never readiness/medical/training. Write in ${language}. Return ONLY JSON: {"summary": string (2-3 sentences — the archetype, how they score, leading strengths), "development": string (1-2 sentences — the clearest area to improve)}.`;
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: AI_MODEL, max_tokens: 600, system, messages: [{ role: "user", content: `Two-axis player analysis:\n${JSON.stringify(facts)}` }] }) });
  } catch { return null; }
  if (!res.ok) return null;
  const j = await res.json();
  let text = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const i = text.indexOf("{"), e = text.lastIndexOf("}"); text = i >= 0 && e > i ? text.slice(i, e + 1) : text;
  try { const p = JSON.parse(text) as { summary?: unknown; development?: unknown }; const summary = typeof p.summary === "string" ? p.summary.trim() : ""; return summary ? { summary, development: typeof p.development === "string" ? p.development.trim() : "" } : null; } catch { return null; }
}

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const seasons = await loadSquadSeasons(auth.supabase, auth.teamId);
  const players = seasons.map((p) => ({ name: p.name, games: p.games, ppg: p.ppg })).sort((a, b) => b.ppg - a.ppg);
  return NextResponse.json({ ok: true, players, hasData: players.length > 0 });
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const player = String(body?.player ?? "").trim();
  if (!player) return NextResponse.json({ ok: false, error: "player is required" }, { status: 400 });
  const seasons = await loadSquadSeasons(auth.supabase, auth.teamId);
  const production = buildBasketballPlayerAnalysis(seasons, player, initialSurnameKey);
  if (!production) return NextResponse.json({ ok: false, error: "No data for that player." }, { status: 404 });
  const styleRows = await loadStyleRows(auth.supabase, auth.teamId, production.name);
  const style = buildPlayStyle(styleRows);
  const arch = archetype(productionLite(production), style);
  const ai = body?.prose === true ? await narrative(production, style, arch, String(body?.lang ?? "EN").toUpperCase() === "IS" ? "IS" : "EN") : null;
  return NextResponse.json({ ok: true, production, style, archetype: arch, ai });
}

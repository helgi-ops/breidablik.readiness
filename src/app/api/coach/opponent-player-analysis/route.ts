export const runtime = "nodejs";
export const maxDuration = 60; // the PDF path fans out one AI read per player (bounded)

/**
 * /api/coach/opponent-player-analysis
 *   GET                         → opponents whose squad carries per-90 metrics (picker)
 *   GET  ?opponent=&season=     → that opponent's players (name, minutes)
 *   POST { opponent, season, player, prose, lang } → the PlayerAnalysis for one
 *                                 opponent player (+ optional opponent-framed AI read)
 *
 * The opponent analog of /api/coach/player-analysis. Same pure engine, but the
 * percentile pool is the OPPONENT's OWN squad (within-their-squad ranking), read from
 * scout_player.metrics (the StatsBomb Squad export, ingested on Opponent Scouting).
 * Rules compute the percentiles; the AI only phrases them (threat / how to stop) and is
 * labelled AI. Descriptive scouting context — it never touches the readiness colour.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildPlayerAnalysis, readMetricBag, type PlayerRow } from "@/lib/micropulse/playerAnalysis";

const MODEL = "claude-haiku-4-5-20251001";

async function getCoachTeam(req: NextRequest) {
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
  return { teamId } as const;
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

type ScoutRow = { player_name: string | null; minutes: number | null; goals: number | null; assists: number | null; xg: number | null; metrics: Record<string, unknown> | null };

/** The opponent season rows this coach owns that actually carry per-90 metrics. */
async function loadSeasons(teamId: string): Promise<Array<{ id: string; opponent: string; season: string }>> {
  const supabase = getSupabase();
  const { data: seasons } = await supabase.from("scout_team_season")
    .select("id, opponent_name, season, is_self").eq("owner_team_id", teamId).eq("is_self", false);
  const rows = (seasons ?? []) as Array<{ id: string; opponent_name: string | null; season: string | null }>;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { data: withMetrics } = await supabase.from("scout_player")
    .select("scout_team_season_id").in("scout_team_season_id", ids).not("metrics", "is", null).limit(2000);
  const has = new Set(((withMetrics ?? []) as Array<{ scout_team_season_id: string }>).map((r) => r.scout_team_season_id));
  return rows.filter((r) => has.has(r.id)).map((r) => ({ id: r.id, opponent: r.opponent_name ?? "—", season: r.season ?? "" }));
}

async function loadSquad(seasonId: string): Promise<PlayerRow[]> {
  const supabase = getSupabase();
  const { data } = await supabase.from("scout_player")
    .select("player_name, minutes, goals, assists, xg, metrics")
    .eq("scout_team_season_id", seasonId).not("metrics", "is", null);
  return ((data ?? []) as ScoutRow[]).map((r) => ({
    name: r.player_name ?? "—", minutes: num(r.minutes), goals: num(r.goals), assists: num(r.assists), xg: num(r.xg),
    metrics: readMetricBag(r.metrics),
  }));
}

async function resolveSeason(teamId: string, opponent: string, season: string): Promise<string | null> {
  const seasons = await loadSeasons(teamId);
  const norm = (s: string) => s.toLowerCase().trim();
  const exact = seasons.find((s) => norm(s.opponent) === norm(opponent) && (!season || norm(s.season) === norm(season)));
  return (exact ?? seasons.find((s) => norm(s.opponent) === norm(opponent)))?.id ?? null;
}

const SYSTEM = `You write a concise OPPONENT PLAYER SCOUTING READ for a head coach preparing to face this player, from per-90 season stats already ranked into PERCENTILES within the OPPONENT's OWN squad. You produce ONLY prose; a separate system renders the numbers/bars.

Hard rules:
- Use ONLY the given numbers (percentiles 0-100 within the opponent squad, the role, minutes). Never invent figures.
- DESCRIPTIVE, association not causation; no prediction. Percentiles are vs THEIR OWN squad only, a small sample — say so if minutes are low.
- Frame for the coach facing them: what makes this player dangerous, and how to limit / stop him. Their LOW percentiles are how-to-nullify openings, not "development".
- Plain language. "npxG" = non-penalty expected goals (chance quality); "OBV" = on-ball value.
- Write in the requested language ONLY.
- Return a JSON object (no markdown fence) with EXACTLY these keys:
  summary: string (1-2 sentences — this player's profile and clearest role/threat),
  threat: string (2-3 sentences on what makes him dangerous, citing the standout percentiles),
  howToStop: string (2-3 sentences on how to limit him — lean on his lower-percentile areas and role).`;

type Analysis = NonNullable<ReturnType<typeof buildPlayerAnalysis>>;

/** One opponent-framed AI read (summary/threat/howToStop) for a player, or null. Labelled AI. */
async function proseFor(analysis: Analysis, opponent: string, langName: string, apiKey: string): Promise<Record<string, unknown> | null> {
  const facts = {
    player: analysis.player, opponent, minutes: analysis.minutes, role: analysis.role, byCategory: analysis.byCategory,
    strengths: analysis.strengths.map((mm) => ({ metric: mm.label, percentile: mm.percentile })),
    weaknesses: analysis.weaknesses.map((mm) => ({ metric: mm.label, percentile: mm.percentile })),
  };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 900, temperature: 0.3, system: SYSTEM,
        messages: [{ role: "user", content: `Write in ${langName}. Return ONLY the JSON object. Data:\n${JSON.stringify(facts)}` }] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    let text = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    text = a >= 0 && b > a ? text.slice(a, b + 1) : text;
    try { return JSON.parse(text); } catch { return null; }
  } catch { return null; }
}

/** Run `worker` over items with a bounded number in flight (keeps AI fan-out polite). */
async function mapPool<T, R>(items: T[], limit: number, worker: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await worker(items[idx]); }
  });
  await Promise.all(runners);
  return out;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const opponent = String(body?.opponent ?? "").trim();
  const season = String(body?.season ?? "").trim();
  if (!opponent) return NextResponse.json({ ok: false, error: "opponent is required" }, { status: 400 });

  const seasonId = await resolveSeason(auth.teamId, opponent, season);
  if (!seasonId) return NextResponse.json({ ok: false, error: "No StatsBomb Squad imported for that opponent yet — add their Squad export on Opponent Scouting." }, { status: 400 });
  const squad = await loadSquad(seasonId);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const langName = body?.lang === "IS" ? "Icelandic" : "English";

  // ?all → the whole squad's analysis in one call for the PDF. With ?prose, each player
  // also gets its opponent-framed AI read (bounded fan-out), so the PDF reads like the page.
  if (body?.all) {
    const analyses = squad
      .filter((p) => (p.minutes ?? 0) > 0)
      .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0))
      .map((p) => buildPlayerAnalysis({ player: p.name, squad }))
      .filter((x): x is Analysis => x != null);
    let withProse = analyses.map((analysis) => ({ analysis, prose: null as Record<string, unknown> | null }));
    if (body?.prose && apiKey) {
      const proses = await mapPool(analyses, 5, (a) => proseFor(a, opponent, langName, apiKey));
      withProse = analyses.map((analysis, idx) => ({ analysis, prose: proses[idx] }));
    }
    return NextResponse.json({ ok: true, opponent, season, players: withProse, aiGenerated: Boolean(body?.prose && apiKey) });
  }

  const player = String(body?.player ?? "").trim();
  if (!player) return NextResponse.json({ ok: false, error: "player is required" }, { status: 400 });
  const analysis = buildPlayerAnalysis({ player, squad });
  if (!analysis) return NextResponse.json({ ok: false, error: "That player isn't in the opponent's StatsBomb squad." }, { status: 404 });

  const prose = body?.prose && apiKey ? await proseFor(analysis, opponent, langName, apiKey) : null;
  return NextResponse.json({ ok: true, analysis, prose, model: prose ? MODEL : null, aiGenerated: Boolean(prose) });
}

export async function GET(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const opponent = (url.searchParams.get("opponent") ?? "").trim();
  const season = (url.searchParams.get("season") ?? "").trim();

  if (opponent) {
    const seasonId = await resolveSeason(auth.teamId, opponent, season);
    if (!seasonId) return NextResponse.json({ ok: true, players: [] });
    const squad = await loadSquad(seasonId);
    const players = squad
      .filter((p) => (p.minutes ?? 0) > 0)
      .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0))
      .map((p) => ({ name: p.name, minutes: p.minutes }));
    return NextResponse.json({ ok: true, players });
  }

  const opponents = await loadSeasons(auth.teamId);
  return NextResponse.json({ ok: true, opponents: opponents.map((o) => ({ opponent: o.opponent, season: o.season })) });
}

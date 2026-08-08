export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * /api/coach/match-review
 *   GET                        → matches that have per-match player data (date, opponent)
 *   POST { date, prose, lang } → the CITED match facts (+ optional AI coach recap)
 *
 * Reviews the coach's OWN team's last-match attacking output from player_match_stats.
 * Rules compute the facts (buildMatchReview); the AI only phrases them and is labelled
 * AI. Descriptive context — it never touches the readiness colour, load, or decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildMatchReview, buildMatchAnalysis, type ReviewPlayer, type TeamMatchNumbers, type SeasonContext } from "@/lib/micropulse/matchReview";

const PLAYER_SOURCES = ["statsbomb_match_report", "statsbomb_csv"];

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
/** Read a metric from the jsonb bag tolerant of PDF vs CSV column names. */
function bagNum(bag: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!bag) return null;
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bag)) lower[k.toLowerCase()] = v;
  for (const k of keys) { const v = lower[k.toLowerCase()]; const n = num(v); if (n != null) return n; }
  return null;
}

type Row = { player_id: string | null; match_date: string; opponent: string | null; home_away: string | null; goals: number | null; assists: number | null; xg: number | null; shots: number | null; key_passes: number | null; metrics: Record<string, unknown> | null; players: { full_name: string | null; position: string | null } | null };

type LoadedPlayers = {
  players: ReviewPlayer[];
  playerObv: Array<{ name: string; obv: number | null; isGoalkeeper: boolean }>;
};

const isGk = (pos: string | null | undefined) => /goal\s?keeper|^gk$|^mv$|markv/i.test((pos ?? "").trim());

async function loadPlayers(teamId: string, date: string): Promise<LoadedPlayers> {
  const supabase = getSupabase();
  const { data } = await supabase.from("player_match_stats")
    .select("goals, assists, xg, shots, key_passes, metrics, players:player_id(full_name, position)")
    .eq("team_id", teamId).eq("match_date", date).in("source", PLAYER_SOURCES).not("player_id", "is", null);
  const rows = (data ?? []) as unknown as Row[];
  const players = rows.map((r) => ({
    name: r.players?.full_name ?? "—",
    goals: num(r.goals), assists: num(r.assists), xg: num(r.xg), shots: num(r.shots), keyPasses: num(r.key_passes),
    xgAssisted: bagNum(r.metrics, "xG Assisted", "xG Assist"),
    xgChain: bagNum(r.metrics, "xG Chain", "xGChain"),
    tackles: bagNum(r.metrics, "Tackles", "T"),
    interceptions: bagNum(r.metrics, "Interceptions", "I"),
  }));
  const playerObv = rows.map((r) => ({
    name: r.players?.full_name ?? "—",
    obv: bagNum(r.metrics, "OBV", "On-Ball Value", "OBV Total"),
    isGoalkeeper: isGk(r.players?.position),
  }));
  return { players, playerObv };
}

/** Back-compat: the compact card still calls the review directly. */
async function loadRows(teamId: string, date: string): Promise<ReviewPlayer[]> {
  return (await loadPlayers(teamId, date)).players;
}

type TeamRowResult = { team: TeamMatchNumbers | null; header: { opponent: string | null; homeAway: string | null; competition: string | null }; season: string | null };
const EMPTY_TEAM: TeamRowResult = { team: null, header: { opponent: null, homeAway: null, competition: null }, season: null };

/** The own team's StatsBomb team-level row for one match (null if not imported). */
async function loadStatsbombTeamRow(teamId: string, date: string): Promise<TeamRowResult> {
  const supabase = getSupabase();
  const { data } = await supabase.from("sb_team_match_stats")
    .select("season, opponent, is_home, goals, goals_against, xg, xg_against, open_play_xg, shots, shots_against, passing_pct, possession_proxy_pct, box_touches, obv, opposition_obv, set_piece_xg, opp_set_piece_goals, gk_pass_length, gk_long_ball_pct")
    .eq("team_id", teamId).eq("match_date", date).maybeSingle();
  if (!data) return EMPTY_TEAM;
  const d = data as Record<string, unknown>;
  const team: TeamMatchNumbers = {
    goals: num(d.goals), goalsAgainst: num(d.goals_against),
    xg: num(d.xg), xgAgainst: num(d.xg_against), openPlayXg: num(d.open_play_xg),
    shots: num(d.shots), shotsAgainst: num(d.shots_against),
    possessionPct: num(d.possession_proxy_pct), passingPct: num(d.passing_pct), boxTouches: num(d.box_touches),
    obv: num(d.obv), oppositionObv: num(d.opposition_obv),
    setPieceXg: num(d.set_piece_xg), oppSetPieceGoals: num(d.opp_set_piece_goals),
    gkPassLength: num(d.gk_pass_length), gkLongBallPct: num(d.gk_long_ball_pct),
  };
  return {
    team,
    header: { opponent: (d.opponent as string) ?? null, homeAway: d.is_home === true ? "home" : d.is_home === false ? "away" : null, competition: null },
    season: (d.season as string) ?? null,
  };
}

/** Wyscout team-level row(s) for one match (team_match_stats, own + opponent). Fills the 9 fields
 * Wyscout carries; the 7 StatsBomb-only fields (OBV, set-piece/open-play xG, GK distribution) stay null. */
async function loadWyscoutTeamRow(teamId: string, date: string): Promise<TeamRowResult> {
  const supabase = getSupabase();
  const { data } = await supabase.from("team_match_stats")
    .select("is_opponent, opponent_name, competition, goals, xg, shots, passes, passes_accurate, possession_pct, touches_in_box")
    .eq("team_id", teamId).eq("match_date", date);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const own = rows.find((r) => r.is_opponent === false);
  const opp = rows.find((r) => r.is_opponent === true);
  if (!own) return EMPTY_TEAM;
  const passes = num(own.passes), acc = num(own.passes_accurate);
  const team: TeamMatchNumbers = {
    goals: num(own.goals), goalsAgainst: opp ? num(opp.goals) : null,
    xg: num(own.xg), xgAgainst: opp ? num(opp.xg) : null, openPlayXg: null,
    shots: num(own.shots), shotsAgainst: opp ? num(opp.shots) : null,
    possessionPct: num(own.possession_pct),
    passingPct: passes && passes > 0 && acc != null ? Math.round((acc / passes) * 1000) / 10 : null,
    boxTouches: num(own.touches_in_box),
    obv: null, oppositionObv: null, setPieceXg: null, oppSetPieceGoals: null, gkPassLength: null, gkLongBallPct: null,
  };
  return {
    team,
    header: { opponent: (own.opponent_name as string) ?? null, homeAway: null, competition: (own.competition as string) ?? null },
    season: null,
  };
}

async function loadTeamRow(teamId: string, date: string, source: "wyscout" | "statsbomb"): Promise<TeamRowResult> {
  return source === "wyscout" ? loadWyscoutTeamRow(teamId, date) : loadStatsbombTeamRow(teamId, date);
}

/** Season context from ALL of the team's StatsBomb match rows (chronic set-piece defence + open-play xG). */
async function loadSeasonContext(teamId: string): Promise<SeasonContext | null> {
  const supabase = getSupabase();
  const { data } = await supabase.from("sb_team_match_stats")
    .select("open_play_xg, opp_set_piece_goals").eq("team_id", teamId).limit(2000);
  const rows = (data ?? []) as Array<{ open_play_xg: number | null; opp_set_piece_goals: number | null }>;
  if (rows.length < 5) return null; // too few matches to be a "season" pattern
  const mean = (vals: Array<number | null>) => { const xs = vals.map(num).filter((x): x is number => x != null); return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null; };
  return {
    matches: rows.length,
    setPieceGoalsConcededPerMatch: mean(rows.map((r) => r.opp_set_piece_goals)),
    openPlayXgPerMatch: mean(rows.map((r) => r.open_play_xg)),
  };
}

/** One AI call → parsed JSON object (fence-stripped, outermost braces). null on any failure. */
async function askClaude(apiKey: string, system: string, userContent: string, maxTokens: number): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature: 0.3, thinking: { type: "disabled" }, system,
        messages: [{ role: "user", content: userContent }] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    let text = String(j?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    text = a >= 0 && b > a ? text.slice(a, b + 1) : text;
    try { return JSON.parse(text); } catch { return null; }
  } catch { return null; }
}

const SYSTEM_ANALYSIS = `You write an article-grade MATCH ANALYSIS for a head coach, from one match's stats that a separate system has already reduced to CITED facts (the score; team-level StatsBomb numbers — xG, open-play xG, OBV "value of actions" for both teams, possession %, passing %, touches in box, set-piece xG, goals conceded from set pieces; per-player facts — the single biggest chance and who had it, the build-up hub by xG chain, the most valuable player on the ball by OBV, the top defender; and, when given, season context). You produce ONLY the prose; a separate system renders the numbers and the table.

Hard rules:
- Use ONLY the given numbers. NEVER invent figures, minutes, timings ("43'/84'"), opponents, or events you weren't given. There is NO shot-by-shot timeline in the data — do NOT narrate one.
- Some matches only have team-level data (result, xG, shots, possession, passing %) and NO OBV, set-piece, open-play-xG or per-player facts. When those are null/absent, LEAD with what IS present (result, xG, possession) and return "" for the obv/setPieces/keepingFinishingPressing keys — do NOT mention OBV or set pieces you weren't given.
- DESCRIPTIVE, association not causation. You MAY state the given score and compare the two teams' given numbers (xG, OBV, possession). Do not claim causes you weren't given.
- OBV = On-Ball Value, "the value of actions": how much each action raised the chance of a goal. A big OBV gap toward the opponent despite less possession means their actions went forward/toward goal while yours recycled. If the MOST valuable player on the ball is the goalkeeper, that means build-up went sideways and back, not forward — say so plainly.
- xG distribution matters: if one big chance is most of the team's xG, the rest of the shots were low value — say the possession didn't reach dangerous areas.
- Plain language for a head coach. Name the players in the facts. Be specific and concise; no hype.
- Write in the requested language ONLY.
- Return a JSON object (no markdown fence) with EXACTLY these string keys, each 1-3 sentences (return "" for any key whose facts are null/missing):
  theRead: the one-paragraph headline verdict — who controlled the ball vs who created more danger, and how the game was decided.
  theReadBody: 2-3 sentences expanding it with the key numbers (xG level on the surface vs the distribution).
  possession: possession % and passing — high volume vs low value.
  chanceQuality: xG distribution — the single biggest chance vs the rest; xG per shot outside it.
  obv: the OBV gap and what it means; the most-valuable-on-the-ball read (incl. the goalkeeper point if applicable).
  setPieces: set-piece xG and the goal conceded from a set piece; tie to season set-piece defence if given.
  keepingFinishingPressing: goalkeeping/finishing/build-up combinations — the difference between taking chances and not.
  whatItTells: the bottom line — what to fix (turning possession into open-play chances; taking big chances), tied to the season pattern if given.`;

const SYSTEM = `You write a concise LAST-MATCH REVIEW for a head coach, from per-player football stats that a separate system has already reduced to a few CITED facts (team xG/shots/goals, the match's top threat, top chance-creator, build-up hub, top defender, and finishing outliers). You produce ONLY prose.

Hard rules:
- Use ONLY the given numbers. Never invent figures, opponents, or events you weren't given.
- DESCRIPTIVE, association not causation. This is your own team's ATTACKING output for one match — do NOT claim a result, scoreline, or opponent comparison you weren't given.
- Plain language for a head coach. "xG" = expected goals (chance quality); "xG chain" = involvement in the moves that led to shots.
- Name the players in the facts. Be specific and short.
- Write in the requested language ONLY.
- Return a JSON object (no markdown fence) with EXACTLY:
  verdict: string (1-2 sentences — the headline of the team's attacking display + finishing),
  keyPoints: string[] (exactly 3 short bullet sentences — who created the chances, the main threat / who to build around, and a finishing or defensive note).`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const date = String(body?.date ?? "").trim();
  if (!date) return NextResponse.json({ ok: false, error: "date is required" }, { status: 400 });
  const lang = body?.lang === "IS" ? "Icelandic" : "English";
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // ── v2: article-grade match analysis (team picture + sectioned prose) ──
  if (body?.mode === "analysis") {
    const supabase = getSupabase();
    const source: "wyscout" | "statsbomb" = body?.source === "wyscout" ? "wyscout" : "statsbomb";
    // Per-player facts are StatsBomb-only (no Wyscout per-match players), so only load them for SB.
    const [loaded, teamRow, seasonContext, teamNameRes, fixtureRes] = await Promise.all([
      source === "statsbomb" ? loadPlayers(auth.teamId, date) : Promise.resolve({ players: [], playerObv: [] }),
      loadTeamRow(auth.teamId, date, source),
      source === "statsbomb" ? loadSeasonContext(auth.teamId) : Promise.resolve(null),
      supabase.from("teams").select("name").eq("id", auth.teamId).maybeSingle(),
      supabase.from("match_schedule").select("opponent, is_home, competition").eq("team_id", auth.teamId).eq("match_date", date).maybeSingle(),
    ]);
    const { players, playerObv } = loaded;
    const teamName = (teamNameRes.data as { name?: string } | null)?.name ?? "Our team";
    if (players.length === 0 && !teamRow.team) {
      return NextResponse.json({ ok: false, error: "No per-match data for that match yet." }, { status: 404 });
    }
    // Fixture fallback fills opponent / home-away when the stats row doesn't carry them (Wyscout).
    const fx = (fixtureRes.data as { opponent?: string | null; is_home?: boolean | null; competition?: string | null } | null) ?? null;
    const opponent = teamRow.header.opponent ?? fx?.opponent ?? null;
    const homeAway = teamRow.header.homeAway ?? (fx?.is_home === true ? "home" : fx?.is_home === false ? "away" : null);
    const competition = teamRow.header.competition ?? fx?.competition ?? null;
    const analysis = buildMatchAnalysis({
      header: { opponent, homeAway, competition, date, venue: null },
      players, playerObv, team: teamRow.team, seasonContext,
    });
    let prose: Record<string, unknown> | null = null;
    let model: string | null = null;
    if (body?.prose && apiKey) {
      // Hand the AI only the reduced facts (never raw rows); force the requested language.
      const p = await askClaude(apiKey, SYSTEM_ANALYSIS, `Write in ${lang}. Return ONLY the JSON object. Facts:\n${JSON.stringify({ ...analysis, gameInNumbers: undefined })}`, 1100);
      if (p) { prose = p; model = MODEL; }
    }
    return NextResponse.json({ ok: true, date, source, teamName, analysis, prose, model, aiGenerated: Boolean(prose) });
  }

  // ── v1: compact review (kept for back-compat) ──
  const rows = await loadRows(auth.teamId, date);
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "No mapped per-match player data for that match yet." }, { status: 404 });
  const facts = buildMatchReview(rows);

  let prose: Record<string, unknown> | null = null;
  let model: string | null = null;
  if (body?.prose && apiKey) {
    const p = await askClaude(apiKey, SYSTEM, `Write in ${lang}. Return ONLY the JSON object. Facts:\n${JSON.stringify(facts)}`, 700);
    if (p) { prose = p; model = MODEL; }
  }

  return NextResponse.json({ ok: true, date, facts, prose, model, aiGenerated: Boolean(prose) });
}

type MatchListItem = { date: string; opponent: string | null; homeAway: "home" | "away" | null; goalsFor: number | null; goalsAgainst: number | null; has: { wyscout: boolean; statsbomb: boolean } };

export async function GET(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const supabase = getSupabase();
  const teamId = auth.teamId;

  // Enumerate matches source-neutrally: any fixture with a played date, plus any match that has
  // StatsBomb (sb_team_match_stats / statsbomb player rows) or Wyscout (team_match_stats own) data,
  // so a Wyscout-only club still sees its matches.
  const [fixturesRes, sbTeamRes, wyTeamRes, pmsRes] = await Promise.all([
    supabase.from("match_schedule").select("match_date, opponent, is_home, goals_for, goals_against").eq("team_id", teamId).limit(2000),
    supabase.from("sb_team_match_stats").select("match_date, opponent, goals, goals_against").eq("team_id", teamId).limit(2000),
    supabase.from("team_match_stats").select("match_date, opponent_name, goals").eq("team_id", teamId).eq("is_opponent", false).limit(2000),
    supabase.from("player_match_stats").select("match_date, opponent").eq("team_id", teamId).in("source", ["statsbomb_match_report", "statsbomb_csv"]).not("player_id", "is", null).limit(2000),
  ]);

  const map = new Map<string, MatchListItem>();
  const get = (date: string): MatchListItem => {
    let m = map.get(date);
    if (!m) { m = { date, opponent: null, homeAway: null, goalsFor: null, goalsAgainst: null, has: { wyscout: false, statsbomb: false } }; map.set(date, m); }
    return m;
  };
  const n = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

  for (const r of (fixturesRes.data ?? []) as Array<Record<string, unknown>>) {
    const m = get(String(r.match_date));
    m.opponent = m.opponent ?? ((r.opponent as string) ?? null);
    m.homeAway = m.homeAway ?? (r.is_home === true ? "home" : r.is_home === false ? "away" : null);
    if (m.goalsFor == null) m.goalsFor = n(r.goals_for);
    if (m.goalsAgainst == null) m.goalsAgainst = n(r.goals_against);
  }
  for (const r of (sbTeamRes.data ?? []) as Array<Record<string, unknown>>) {
    const m = get(String(r.match_date)); m.has.statsbomb = true;
    m.opponent = m.opponent ?? ((r.opponent as string) ?? null);
    if (m.goalsFor == null) m.goalsFor = n(r.goals);
    if (m.goalsAgainst == null) m.goalsAgainst = n(r.goals_against);
  }
  for (const r of (wyTeamRes.data ?? []) as Array<Record<string, unknown>>) {
    const m = get(String(r.match_date)); m.has.wyscout = true;
    m.opponent = m.opponent ?? ((r.opponent_name as string) ?? null);
    if (m.goalsFor == null) m.goalsFor = n(r.goals);
  }
  for (const r of (pmsRes.data ?? []) as Array<{ match_date: string; opponent: string | null }>) {
    const m = get(String(r.match_date)); m.has.statsbomb = true;
    m.opponent = m.opponent ?? r.opponent;
  }

  // Only matches that actually have team/player stats can produce a recap (fixtures just enrich them).
  const matches = [...map.values()]
    .filter((m) => m.has.wyscout || m.has.statsbomb)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const providers = {
    wyscout: matches.some((m) => m.has.wyscout),
    statsbomb: matches.some((m) => m.has.statsbomb),
  };
  return NextResponse.json({ ok: true, matches, providers });
}

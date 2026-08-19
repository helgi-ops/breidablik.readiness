export const runtime = "nodejs";

/**
 * /api/coach/scouting/opponent
 *   ?list=1                    → the scouted opponents this team has (picker)
 *   ?opponent=&season=         → the full OpponentReport, benchmarked against league + own team
 *
 * Team-scoped (COACH/ADMIN/STAFF). Descriptive context only — never touches readiness.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildOpponentReport, type Metrics, type ScoutMatch, type ScoutPlayerRow } from "@/lib/micropulse/scouting/opponentReport";
import { metricsFromRows, metricsFromScoutRow, metricsFromLeagueRef } from "@/lib/micropulse/scouting/aggregate";

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

const PROSE_MODEL = "claude-haiku-4-5-20251001";
const PROSE_SYSTEM = `You write a PRE-MATCH OPPONENT SCOUTING read for a head coach preparing to face an opponent. You describe the OPPONENT in third person ("they / them") and how OUR team (name given, "we / us") can hurt them, from season numbers that are benchmarked against the league average and against our team. You produce ONLY prose; a separate system renders the numbers tables.

Hard rules:
- Use ONLY the numbers in the user message (opponent value, league average, our value, and any tagged read). Never invent or add figures.
- DESCRIPTIVE context, association not causation. Never predict the result; never claim a stat CAUSES outcomes.
- Actionable and specific to how WE attack/defend THEM. Plain language a coach reads fast. "npxG" = non-penalty expected goals (chance quality); "OBV" = on-ball value; PPDA may be called pressing.
- Write in the requested language ONLY.
- Return a JSON object (no markdown fence) with EXACTLY these keys:
  verdict: string (ONE sentence — the headline game-plan read),
  verdictBody: string (2-3 sentences expanding it),
  facts: string[] (EXACTLY 3 — the facts behind the verdict, each 1-2 sentences),
  howTheyPlay: string (2-3 sentences on their style: possession, block height, pressing, main attacking route),
  whereToHurt: {t: string, b: string}[] (3-4, PRIORITY ORDER — how WE attack them; t = short label, b = one sentence),
  respect: {t: string, b: string}[] (1-2 — what to respect about them + the set-piece plan when defending them),
  gamePlan: string (ONE paragraph, 3-4 sentences — the plan to win this game).`;

/** Generate the AI scouting prose (labelled AI) from the computed report numbers. */
async function buildOpponentProse(report: unknown, opponent: string, ownName: string, lang: "EN" | "IS"): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const r = report as Record<string, unknown>;
  const cited = (b: unknown) => (((b as { facts?: Array<{ metric: string; value: number | null; league: number | null; own?: number | null }> })?.facts) ?? []);
  const facts = [...cited(r.identity), ...cited(r.attack), ...cited(r.defend), ...cited(r.setPieces)]
    .map((c) => ({ metric: c.metric, opponent: c.value, league: c.league, us: c.own ?? null }));
  const data = {
    opponent, us: ownName, season: r.season, matches: r.matches, record: r.record,
    goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
    statsbomb: r.statsbomb, matchup: (r.matchup as { rows?: unknown })?.rows ?? null,
    facts,
  };
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: PROSE_MODEL, max_tokens: 3000, temperature: 0.3, system: PROSE_SYSTEM,
        messages: [{ role: "user", content: `Write in ${lang === "IS" ? "Icelandic" : "English"}. Return ONLY the JSON object. Data:\n${JSON.stringify(data)}` }] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    let text = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    text = a >= 0 && b > a ? text.slice(a, b + 1) : text;
    return JSON.parse(text);
  } catch { return null; }
}

async function auth(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { teamId, supabase } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await auth(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { teamId, supabase } = ctx;
  const url = new URL(req.url);

  if (url.searchParams.get("list")) {
    const { data } = await supabase.from("scout_team_season")
      .select("opponent_name, season, matches, source, updated_at")
      .eq("owner_team_id", teamId).eq("is_self", false).order("updated_at", { ascending: false });
    // Collapse the (now possibly two) per-source rows into one entry per opponent+season,
    // carrying which sources are present so the picker can show a merged badge.
    const byKey = new Map<string, { opponent_name: string; season: string; matches: number; sources: string[]; updated_at: string }>();
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const key = `${r.opponent_name}|${r.season}`;
      const src = String(r.source ?? "wyscout");
      const cur = byKey.get(key);
      if (cur) { cur.matches = Math.max(cur.matches, Number(r.matches ?? 0)); if (!cur.sources.includes(src)) cur.sources.push(src); }
      else byKey.set(key, { opponent_name: String(r.opponent_name), season: String(r.season), matches: Number(r.matches ?? 0), sources: [src], updated_at: String(r.updated_at ?? "") });
    }
    return NextResponse.json({ ok: true, opponents: [...byKey.values()] });
  }

  const opponent = (url.searchParams.get("opponent") ?? "").trim();
  const season = (url.searchParams.get("season") ?? "").trim();
  if (!opponent || !season) return NextResponse.json({ ok: false, error: "opponent and season are required" }, { status: 400 });

  // A scouted opponent can now hold BOTH a Wyscout and a StatsBomb season row (one per
  // source). Fetch all, then merge: StatsBomb leads, Wyscout fills the gaps it can't cover.
  const { data: rows } = await supabase.from("scout_team_season").select("*")
    .eq("owner_team_id", teamId).eq("opponent_name", opponent).eq("season", season).eq("is_self", false);
  const allRows = (rows ?? []) as Array<Record<string, unknown>>;
  if (!allRows.length) return NextResponse.json({ ok: false, error: "No scouting for that opponent/season yet." }, { status: 404 });
  const wRow = allRows.find((r) => String(r.source ?? "wyscout") !== "statsbomb") ?? null;
  const sRow = allRows.find((r) => String(r.source ?? "") === "statsbomb") ?? null;
  // Per-match data (form) only comes from the Wyscout import; players prefer the StatsBomb
  // squad (richer per-90) then Wyscout. Benchmark team is always the coach's own team.
  const matchSeasonId = ((wRow ?? sRow) as { id: string }).id;
  const playerIds = [sRow, wRow].filter(Boolean).map((r) => (r as { id: string }).id);

  const [{ data: matchRows }, { data: playerRowsAll }, { data: ownRows }, { data: leagueRows }] = await Promise.all([
    supabase.from("scout_team_match").select("match_date, opponent, is_home, goals, goals_against, xg, xg_against, result, shots, shots_against, possession_pct, ppda, def_duels_won_pct, forward_passes, forward_pass_acc_pct, passes_final_third, passes_final_third_acc_pct, progressive_passes, smart_passes, smart_pass_acc_pct, crosses, cross_acc_pct, positional_attacks, counterattacks, offensive_duels_won_pct").eq("scout_team_season_id", matchSeasonId),
    supabase.from("scout_player").select("scout_team_season_id, player_name, position, minutes, goals, xg, assists, xa, received_passes").in("scout_team_season_id", playerIds.length ? playerIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("team_match_stats").select("is_opponent, xg, goals, shots, possession_pct, ppda, def_duels_won_pct, forward_passes, forward_pass_acc_pct, passes_final_third, passes_final_third_acc_pct, progressive_passes, smart_passes, smart_pass_acc_pct, crosses, cross_acc_pct, positional_attacks, counterattacks, offensive_duels_won_pct, match_date").eq("team_id", teamId),
    supabase.from("team_match_stats").select("is_opponent, xg, goals, shots, possession_pct, ppda, def_duels_won_pct, forward_passes, forward_pass_acc_pct, passes_final_third, passes_final_third_acc_pct, progressive_passes, smart_passes, smart_pass_acc_pct, crosses, cross_acc_pct, positional_attacks, counterattacks, offensive_duels_won_pct, match_date"),
  ]);

  const inSeason = (r: Record<string, unknown>) => String((r.match_date as string | null) ?? "").startsWith(season);
  const own: Metrics = metricsFromRows(((ownRows ?? []) as Array<Record<string, unknown> & { is_opponent: boolean | null }>).filter(inSeason));
  const wyLeague: Metrics = metricsFromRows(((leagueRows ?? []) as Array<Record<string, unknown> & { is_opponent: boolean | null }>).filter(inSeason));
  const sbLeague: Metrics | null = sRow ? metricsFromLeagueRef(sRow.league_ref) : null;

  // Merge the two sources per metric: StatsBomb value if present, else Wyscout. Each metric is
  // benchmarked against ITS OWN source's league average — providers are never mixed in a compare.
  const wM: Metrics | null = wRow ? metricsFromScoutRow(wRow) : null;
  const sM: Metrics | null = sRow ? metricsFromScoutRow(sRow) : null;
  const baseM = (sM ?? wM) as Metrics;
  const metricKeys = Object.keys(baseM) as Array<keyof Metrics>;
  const mergedOpp = {} as Metrics;
  const mergedLeague = {} as Metrics;
  const metricSource: Record<string, "wyscout" | "statsbomb"> = {};
  for (const k of metricKeys) {
    const sv = sM ? sM[k] : null, wv = wM ? wM[k] : null;
    if (sv != null) { mergedOpp[k] = sv; metricSource[k] = "statsbomb"; mergedLeague[k] = sbLeague?.[k] ?? null; }
    else if (wv != null) { mergedOpp[k] = wv; metricSource[k] = "wyscout"; mergedLeague[k] = wyLeague[k] ?? null; }
    else { mergedOpp[k] = null; mergedLeague[k] = (sbLeague?.[k] ?? wyLeague[k]) ?? null; }
  }
  const source = sRow ? "statsbomb" : "wyscout";
  const league = mergedLeague;
  const sourcesPresent: Array<"wyscout" | "statsbomb"> = [...(wRow ? ["wyscout" as const] : []), ...(sRow ? ["statsbomb" as const] : [])];
  const row = (sRow ?? wRow) as Record<string, unknown>; // scalar fields (matches/position/sb_extras) — SB preferred
  const sbExtrasRow = sRow ?? null;
  // Players: prefer the StatsBomb squad rows (richer), fall back to Wyscout.
  const allPlayerRows = (playerRowsAll ?? []) as Array<Record<string, unknown>>;
  const sbPlayerRows = sRow ? allPlayerRows.filter((p) => p.scout_team_season_id === sRow.id) : [];
  const playerRows = sbPlayerRows.length ? sbPlayerRows : allPlayerRows.filter((p) => wRow && p.scout_team_season_id === wRow.id);

  const matches: ScoutMatch[] = ((matchRows ?? []) as Record<string, unknown>[]).map((m) => ({
    date: String(m.match_date ?? ""), opponent: (m.opponent as string) ?? null, isHome: (m.is_home as boolean) ?? null,
    goals: num(m.goals), goalsAgainst: num(m.goals_against), xg: num(m.xg), xgAgainst: num(m.xg_against),
    result: (m.result as "W" | "D" | "L") ?? null,
    shots: num(m.shots), shotsAgainst: num(m.shots_against), possession: num(m.possession_pct), ppda: num(m.ppda),
    defDuelsWonPct: num(m.def_duels_won_pct), forwardPasses: num(m.forward_passes), forwardPassAccPct: num(m.forward_pass_acc_pct),
    passesFinalThird: num(m.passes_final_third), passesFinalThirdAccPct: num(m.passes_final_third_acc_pct), progressivePasses: num(m.progressive_passes),
    smartPasses: num(m.smart_passes), smartPassAccPct: num(m.smart_pass_acc_pct), crosses: num(m.crosses), crossAccPct: num(m.cross_acc_pct),
    positionalAttacks: num(m.positional_attacks), counterattacks: num(m.counterattacks), offensiveDuelsWonPct: num(m.offensive_duels_won_pct),
  }));
  const players: ScoutPlayerRow[] = ((playerRows ?? []) as Record<string, unknown>[]).map((p) => ({
    name: String(p.player_name ?? ""), position: (p.position as string) ?? null,
    minutes: num(p.minutes), goals: num(p.goals), xg: num(p.xg), assists: num(p.assists), xa: num(p.xa), receivedPasses: num(p.received_passes),
  }));

  const { data: ownTeam } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
  const report = buildOpponentReport({
    opponent: { name: opponent, matches: num((row as { matches?: number }).matches) ?? matches.length, m: mergedOpp },
    league, own, matches, players, season, ownName: (ownTeam as { name?: string } | null)?.name,
    position: (row as { league_position?: number | null }).league_position ?? null,
    source, sbExtras: (sbExtrasRow as { sb_extras?: Record<string, unknown> | null } | null)?.sb_extras ?? null,
  });
  // Merged-view provenance: which sources fed the report + per-metric source tags for the UI.
  report.sources = sourcesPresent;
  report.metricSource = metricSource;
  // AI prose (labelled) only when the PDF/article view asks for it (?prose=1) — keeps
  // the normal page fetch instant and rule-based.
  let prose: Record<string, unknown> | null = null;
  if (url.searchParams.get("prose")) {
    const lang = url.searchParams.get("lang") === "IS" ? "IS" : "EN";
    prose = await buildOpponentProse(report, opponent, (ownTeam as { name?: string } | null)?.name ?? "our team", lang);
  }
  return NextResponse.json({ ok: true, report, prose, aiGenerated: Boolean(prose), updatedAt: (row as { updated_at?: string }).updated_at ?? null });
}

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * /api/coach/season-report
 *
 * POST — build a one-team season match-stats report and (if AI is configured) an
 * AI-written narrative from the computed numbers. The numbers are deterministic
 * aggregates of ingested Wyscout team stats (team_match_stats); the AI ONLY
 * rephrases them into sectioned prose — it is labelled as AI in the PDF and cites
 * the real figures, per the explainability rules. Descriptive context only; it
 * never touches the readiness colour.
 *
 * Body: { team_id?, teamName?, resultCorrelations?: {key,r,n}[] }  (the last is the
 * GPS/IMA "what tracks the result" set already computed on the page — passed in so
 * the report can mention the physical picture without re-running the movement pipeline).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildSeasonReport, seasonHeadline, type OwnMatchRow, type OppMatchRow, type MatchResult, type ModelSummary } from "@/lib/micropulse/seasonReport";

const MODEL = "claude-haiku-4-5-20251001";

async function getCoachTeam(req: NextRequest, targetTeamId?: string | null) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const primary = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!primary) return { error: "Coach not linked to a team", status: 400 } as const;
  if (!targetTeamId || targetTeamId === primary) return { teamId: primary } as const;
  const { data: ct } = await supabase.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", targetTeamId).maybeSingle();
  if (!ct) return { error: "No access to that team", status: 403 } as const;
  return { teamId: targetTeamId } as const;
}

const SYSTEM = `You write a single-team football SEASON REPORT for a head coach, from per-match team stats that have already been computed. You produce ONLY the prose; a separate system renders the numbers and tables.

Hard rules:
- Use ONLY the numbers in the user message. Never invent, estimate, or add league averages/ranks that are not given.
- This is DESCRIPTIVE context, association not causation. Never claim a stat CAUSES results; never predict future results or give transfer/recruitment advice.
- Goalkeeping "goals saved" = xG conceded minus goals conceded. A positive value means the keeper (and finishing, for the attack) is outperforming the chances — say plainly that this kind of over/under-performance tends to regress, without overstating it.
- Small samples (few losses) must be flagged as tentative.
- Plain language a coach reads fast. No sport-science jargon (no "IMA", "ACWR", raw band numbers). "PPDA" may be used but call it pressing.
- Write in the requested language ONLY.
- Return a JSON object (no markdown fence) with EXACTLY these string keys, each 1-3 sentences: headline, attack, defence, goalkeeping, pressing, winsLosses, physical, bottomLine. If a section has no data (e.g. physical is null), return an empty string "" for that key.`;

type Corr = { key: string; r: number; n: number; direction?: string };

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Compute one provider's season headline (for the model-comparison table) — its own
 * latest-year rows, results from the entered fixture score else derived from goals.
 * Returns null when that provider has no season data (never a cross-provider blend). */
async function providerHeadline(
  supabase: ReturnType<typeof getSupabase>,
  teamId: string,
  source: "statsbomb" | "wyscout",
  schedByDate: Map<string, { gf: number | null; ga: number | null }>,
): Promise<ModelSummary | null> {
  const own: OwnMatchRow[] = [];
  const oppByDate = new Map<string, OppMatchRow>();
  if (source === "statsbomb") {
    const { data } = await supabase.from("sb_team_match_stats")
      .select("match_date, goals, goals_against, xg, xg_against, shots, shots_against, possession_proxy_pct")
      .eq("team_id", teamId);
    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return null;
    for (const r of rows) oppByDate.set(String(r.match_date), { date: String(r.match_date), goals: toNum(r.goals_against), xg: toNum(r.xg_against), shots: toNum(r.shots_against) });
    for (const r of rows) own.push({ date: String(r.match_date), result: null, home: null, goals: toNum(r.goals), xg: toNum(r.xg), shots: toNum(r.shots), possessionPct: toNum(r.possession_proxy_pct), ppda: null, defDuelsWonPct: null });
  } else {
    const { data: o } = await supabase.from("team_match_stats").select("match_date, goals, xg, shots, possession_pct, ppda, def_duels_won_pct").eq("team_id", teamId).eq("is_opponent", false);
    const { data: p } = await supabase.from("team_match_stats").select("match_date, goals, xg, shots").eq("team_id", teamId).eq("is_opponent", true);
    const rows = (o ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return null;
    for (const r of (p ?? []) as Record<string, unknown>[]) oppByDate.set(String(r.match_date), { date: String(r.match_date), goals: toNum(r.goals), xg: toNum(r.xg), shots: toNum(r.shots) });
    for (const r of rows) own.push({ date: String(r.match_date), result: null, home: null, goals: toNum(r.goals), xg: toNum(r.xg), shots: toNum(r.shots), possessionPct: toNum(r.possession_pct), ppda: toNum(r.ppda), defDuelsWonPct: toNum(r.def_duels_won_pct) });
  }
  const yr = Math.max(...own.map((r) => Number(r.date.slice(0, 4))).filter(Number.isFinite));
  const inYr = own.filter((r) => Number(r.date.slice(0, 4)) === yr).map((r) => {
    const sc = schedByDate.get(r.date);
    const ga = oppByDate.get(r.date)?.goals ?? null;
    let result: MatchResult | null = null;
    if (sc && sc.gf != null && sc.ga != null) result = sc.gf > sc.ga ? "W" : sc.gf < sc.ga ? "L" : "D";
    else if (r.goals != null && ga != null) result = r.goals > ga ? "W" : r.goals < ga ? "L" : "D";
    return { ...r, result };
  });
  const opp = [...oppByDate.values()].filter((o2) => Number(o2.date.slice(0, 4)) === yr);
  return seasonHeadline(source, buildSeasonReport({ team: "Team", own: inYr, opp }));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const requestedTeamId = (String(body?.team_id ?? "").trim()) || null;
  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const teamId = auth.teamId;
  const lang = body?.lang === "IS" ? "Icelandic" : "English";
  // The report is bound to the selected data provider so it never silently exports a
  // different source than the coach is looking at. StatsBomb → sb_team_match_stats;
  // Wyscout → team_match_stats. (StatsBomb per-match has no PPDA / defensive duels, so
  // those stay null and their sections are omitted — honest, not a Wyscout fallback.)
  const source: "statsbomb" | "wyscout" = body?.source === "statsbomb" ? "statsbomb" : "wyscout";

  const supabase = getSupabase();
  let ownRows: Record<string, unknown>[] = [];
  const oppByDate = new Map<string, { goals: number | null; xg: number | null; shots: number | null }>();

  if (source === "statsbomb") {
    // One row per match carries both own and against-side numbers.
    const { data: sbRaw } = await supabase
      .from("sb_team_match_stats")
      .select("match_date, opponent, is_home, goals, goals_against, xg, xg_against, shots, shots_against, possession_proxy_pct")
      .eq("team_id", teamId);
    ownRows = ((sbRaw ?? []) as Record<string, unknown>[]).map((r) => ({
      match_date: r.match_date, opponent_name: r.opponent, is_home: r.is_home,
      goals: r.goals, xg: r.xg, shots: r.shots, possession_pct: r.possession_proxy_pct,
      ppda: null, def_duels_won_pct: null,
    }));
    for (const r of (sbRaw ?? []) as Record<string, unknown>[]) {
      oppByDate.set(String(r.match_date), { goals: toNum(r.goals_against), xg: toNum(r.xg_against), shots: toNum(r.shots_against) });
    }
    if (ownRows.length === 0) {
      return NextResponse.json({ ok: false, error: "No StatsBomb match stats ingested yet — import a StatsBomb Match Stats CSV first." }, { status: 400 });
    }
  } else {
    const { data: ownRaw } = await supabase
      .from("team_match_stats")
      .select("match_date, opponent_name, goals, xg, shots, possession_pct, ppda, def_duels_won_pct")
      .eq("team_id", teamId).eq("is_opponent", false);
    const { data: oppRaw } = await supabase
      .from("team_match_stats")
      .select("match_date, goals, xg, shots")
      .eq("team_id", teamId).eq("is_opponent", true);
    ownRows = (ownRaw ?? []) as Record<string, unknown>[];
    for (const o of (oppRaw ?? []) as Record<string, unknown>[]) {
      oppByDate.set(String(o.match_date), { goals: toNum(o.goals), xg: toNum(o.xg), shots: toNum(o.shots) });
    }
    if (ownRows.length === 0) {
      return NextResponse.json({ ok: false, error: "No team match stats ingested yet — import a Wyscout export first." }, { status: 400 });
    }
  }

  // Current season = the latest year present.
  const year = Math.max(...ownRows.map((r) => Number(String(r.match_date).slice(0, 4))).filter(Number.isFinite));
  const inSeason = (d: string) => Number(String(d).slice(0, 4)) === year;

  // Result: hand-entered Fixtures score first, else derived from Wyscout goals.
  const { data: sched } = await supabase
    .from("match_schedule").select("match_date, goals_for, goals_against, is_home").eq("team_id", teamId);
  const schedByDate = new Map<string, { gf: number | null; ga: number | null }>();
  const homeByDate = new Map<string, boolean>();
  for (const s of (sched ?? []) as Record<string, unknown>[]) {
    schedByDate.set(String(s.match_date), { gf: toNum(s.goals_for), ga: toNum(s.goals_against) });
    if (typeof s.is_home === "boolean") homeByDate.set(String(s.match_date), s.is_home);
  }
  const oppGoalsByDate = new Map<string, number | null>();
  for (const [date, o] of oppByDate) oppGoalsByDate.set(date, o.goals);

  // Real team name from the teams table (the per-match rows only carry OPPONENT names,
  // so falling back to "Your team" was wrong). Body override wins if provided.
  const { data: ownTeam } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
  const teamName = (String(body?.teamName ?? "").trim()) || (String((ownTeam as { name?: string } | null)?.name ?? "").trim()) || "Team";

  const own: OwnMatchRow[] = ownRows.filter((r) => inSeason(String(r.match_date))).map((r) => {
    const date = String(r.match_date);
    const sc = schedByDate.get(date);
    const gf = toNum(r.goals), ga = oppGoalsByDate.get(date) ?? null;
    let result: MatchResult | null = null;
    if (sc && sc.gf != null && sc.ga != null) result = sc.gf > sc.ga ? "W" : sc.gf < sc.ga ? "L" : "D";
    else if (gf != null && ga != null) result = gf > ga ? "W" : gf < ga ? "L" : "D";
    // Venue: StatsBomb rows carry is_home; Wyscout has none, so fall back to the
    // fixture's is_home from match_schedule (null when the fixture isn't recorded).
    const home = typeof r.is_home === "boolean" ? (r.is_home as boolean) : (homeByDate.get(date) ?? null);
    return {
      date, result, home,
      goals: gf, xg: toNum(r.xg), shots: toNum(r.shots),
      possessionPct: toNum(r.possession_pct), ppda: toNum(r.ppda), defDuelsWonPct: toNum(r.def_duels_won_pct),
    };
  });
  const opp: OppMatchRow[] = [...oppByDate.entries()].filter(([date]) => inSeason(date)).map(([date, o]) => ({
    date, goals: o.goals, xg: o.xg, shots: o.shots,
  }));

  const data = buildSeasonReport({ team: teamName, own, opp });

  // Model comparison — the selected provider's headline beside the other provider's
  // (if it also has data), computed independently and never merged.
  const otherSource = source === "statsbomb" ? "wyscout" : "statsbomb";
  const otherHeadline = await providerHeadline(supabase, teamId, otherSource, schedByDate).catch(() => null);
  const models: { statsbomb?: ModelSummary; wyscout?: ModelSummary } = { [source]: seasonHeadline(source, data) };
  if (otherHeadline) models[otherSource] = otherHeadline;

  // Physical (GPS/IMA) picture, passed in from the page's already-computed correlations.
  const rawCorr: Corr[] = Array.isArray(body?.resultCorrelations) ? body.resultCorrelations : [];
  const physical = rawCorr.length
    ? rawCorr.filter((c) => typeof c?.r === "number" && typeof c?.n === "number")
        .sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 6)
        .map((c) => ({ key: c.key, r: Math.round(c.r * 100) / 100, n: c.n }))
    : null;

  // AI narrative (labelled) — optional; the report still renders without it.
  let narrative: Record<string, string> | null = null;
  let model: string | null = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const facts = { season: year, ...data, physical };
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODEL, max_tokens: 900, temperature: 0.3, system: SYSTEM,
          messages: [{ role: "user", content: `Write in ${lang}. Return ONLY the JSON object. Data:\n${JSON.stringify(facts)}` }],
        }),
      });
      if (res.ok) {
        const j = await res.json();
        const text = (j?.content?.[0]?.text ?? "").trim();
        const jsonStr = text.startsWith("{") ? text : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
        try { narrative = JSON.parse(jsonStr); } catch { narrative = { headline: text }; }
        model = MODEL;
      }
    } catch { /* narrative stays null — report still renders from numbers */ }
  }

  return NextResponse.json({ ok: true, season: year, source, models, data, physical, narrative, model, aiGenerated: Boolean(narrative) });
}

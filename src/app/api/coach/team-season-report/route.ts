export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * /api/coach/team-season-report
 *
 * The article-quality OWN-team season report: a StatsBomb Team Stats profile (season
 * aggregate + built-in League Average) → a first-person read (verdict, three facts,
 * strengths / weaknesses, priority improvements) over a full metric-vs-league table.
 *
 * Numbers are rule-computed (buildTeamSeasonStatsbomb); an AI layer (labelled) ONLY
 * rephrases them into prose and cites the figures. Descriptive context — it never
 * touches the readiness colour. Bound to the stored own-team profile (is_self=true);
 * if none exists it 400s (never a fallback to a different source).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildTeamSeasonStatsbomb, topContributors, type Sb, type PlayerRow } from "@/lib/micropulse/seasonReport/teamStatsbomb";

const MODEL = "claude-haiku-4-5-20251001";

async function getCoachTeam(req: NextRequest, targetTeamId?: string | null) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
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

const SYSTEM = `You write the READ for a single-team football SEASON REPORT for a head coach, in FIRST PERSON about the coach's OWN team ("we / our / the team"), from per-match season numbers benchmarked against the league average that have ALREADY been computed. You produce ONLY prose; a separate system renders the numbers table.

Hard rules:
- Use ONLY the numbers in the user message (team value, league average, and the tagged read). Never invent or add figures.
- DESCRIPTIVE context, association not causation. Never claim a stat CAUSES results, never predict future results, never give transfer advice.
- Where results outrun the underlying numbers (goals above npxG), say plainly this over-performance tends to regress — a strength today, a risk if creation doesn't rise. Do not overstate.
- Plain language a coach reads fast. "npxG" = non-penalty expected goals (chance quality); "OBV" = on-ball value (goal value added by actions). PPDA may be called pressing.
- Write in the requested language ONLY.
- Return a JSON object (no markdown fence) with EXACTLY these keys:
  verdict: string (ONE sentence, the headline read),
  verdictBody: string (2-3 sentences expanding it),
  facts: string[] (EXACTLY 3 — the facts behind the verdict, each 1-2 sentences),
  strengths: {t: string, b: string}[] (3-4; t = short label, b = one sentence),
  weaknesses: {t: string, b: string}[] (3-4),
  improve: {t: string, b: string}[] (3-4, PRIORITY ORDER — biggest available gain first),
  form: string (1-2 sentences, or "" if no form data).`;

function toNum(v: unknown): number | null { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = await getCoachTeam(req, (String(body?.team_id ?? "").trim()) || null);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const teamId = auth.teamId;
  const lang = body?.lang === "IS" ? "Icelandic" : "English";

  const supabase = getSupabase();
  const { data: row } = await supabase.from("scout_team_season")
    .select("opponent_name, season, matches, sb_extras")
    .eq("owner_team_id", teamId).eq("is_self", true).eq("source", "statsbomb")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!row) {
    return NextResponse.json({ ok: false, error: "No own-team StatsBomb Team Stats profile yet — upload your StatsBomb IQ Team Stats export (with the League Average row) first." }, { status: 400 });
  }
  const sb = (row as { sb_extras?: { team?: Sb; league?: Sb } | null }).sb_extras ?? null;
  const team_sb = (sb?.team ?? {}) as Sb;
  const league_sb = (sb?.league ?? {}) as Sb;
  if (!team_sb.npxg || !league_sb.npxg) {
    return NextResponse.json({ ok: false, error: "The stored profile is missing StatsBomb metrics — re-upload the Team Stats export." }, { status: 400 });
  }

  const teamName = String((row as { opponent_name?: string }).opponent_name ?? "Our team");
  const season = String((row as { season?: string }).season ?? "");
  const matches = toNum((row as { matches?: unknown }).matches);
  const data = buildTeamSeasonStatsbomb({ team: teamName, season, matches, team_sb, league_sb });

  // Key contributors — from the StatsBomb Squad season stats (per-90). Optional: if the
  // Squad hasn't been imported the section is simply omitted (honest, never fabricated).
  const { data: sqRaw } = await supabase.from("player_season_stats")
    .select("wyscout_player_name, minutes, metrics")
    .eq("team_id", teamId).eq("source", "statsbomb_csv").eq("season", season);
  const players: PlayerRow[] = ((sqRaw ?? []) as Array<{ wyscout_player_name: string | null; minutes: number | null; metrics: Record<string, unknown> | null }>).map((r) => ({
    name: r.wyscout_player_name ?? "—",
    minutes: toNum(r.minutes),
    obv: toNum(r.metrics?.["OBV"]), npxg: toNum(r.metrics?.["Non Penalty xG"]),
    xa: toNum(r.metrics?.["xG Assisted"]), defObv: toNum(r.metrics?.["Defensive Action OBV"]),
  }));
  const contributors = players.length ? topContributors(players) : null;

  // AI narrative (labelled) — optional; the report still renders from the table + tags.
  let prose: Record<string, unknown> | null = null;
  let model: string | null = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    const facts = {
      team: teamName, season, matches,
      signals: data.signals,
      contributors,
      rows: data.rows.map((r) => ({ metric: r.key, value: r.value, league: r.league, read: r.read })),
    };
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 1100, temperature: 0.3, system: SYSTEM,
          messages: [{ role: "user", content: `Write in ${lang}. Return ONLY the JSON object. Data:\n${JSON.stringify(facts)}` }] }),
      });
      if (res.ok) {
        const j = await res.json();
        const text = (j?.content?.[0]?.text ?? "").trim();
        const jsonStr = text.startsWith("{") ? text : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
        try { prose = JSON.parse(jsonStr); model = MODEL; } catch { prose = null; }
      }
    } catch { /* prose stays null — report still renders from numbers */ }
  }

  return NextResponse.json({
    ok: true, source: "statsbomb", team: teamName, season, matches,
    rows: data.rows, signals: data.signals, contributors, prose, model, aiGenerated: Boolean(prose),
  });
}

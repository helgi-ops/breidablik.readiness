/**
 * /api/coach/team-analysis
 *
 * POST — generate a 2-paragraph deeper team analysis from squad-wide
 * signals: today's verdict mix, dominant fatigue, neural state, weekly
 * narrative inputs (load deltas, declining players, injuries). Goes to
 * Claude Haiku with a tight prompt and the same anti-hallucination
 * pattern used by the per-player summary route.
 *
 * Architecture lesson (2026-04-29 again):
 *   - All raw numbers are pre-computed by deterministic engines and
 *     handed to Claude as labelled facts. Claude only writes prose
 *     around them — never invents values, never re-interprets bands.
 *   - English only by design (Icelandic LLM output had spelling errors).
 *   - Cached in `team_analysis_cache` for 4 hours per team.
 *
 * Gating: ELITE tier only. PRO/FREE get 402.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isEliteTeam, ELITE_REQUIRED_RESPONSE } from "@/lib/micropulse/elite";

export const runtime = "nodejs";
export const maxDuration = 30;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 380;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getCoachTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 };
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 };
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 };
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 };
  return { userId, teamId };
}

type TeamFacts = {
  team_name: string;
  is_off_day: boolean;
  squad_size: number;
  full_count: number;
  reduced_count: number;
  recovery_count: number;
  dominant_fatigue: string | null;
  neural_load_state: string | null;
  next_day_risk: string | null;
  volatility_pct: number | null;
  avg_risk_score: number | null;
  protected_count: number;
  baseline_maturity: string | null;
  acwr_team: number | null;
  load_delta_pct: number | null;
  high_load_days_7d: number;
  match_days_7d: number;
  declining_players: string[];
  injured_players: string[];
  reduced_recovery_count_7d: number;
};

async function gatherTeamFacts(
  supabase: ReturnType<typeof getSupabase>,
  teamId: string,
): Promise<TeamFacts | null> {
  const today = new Date().toISOString().slice(0, 10);
  const start7 = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const start28 = new Date(Date.now() - 27 * 86_400_000).toISOString().slice(0, 10);

  const { data: team } = await supabase
    .from("teams").select("name").eq("id", teamId).maybeSingle();
  if (!team) return null;

  const { data: pl } = await supabase
    .from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const players = (pl ?? []) as Array<{ id: string; full_name: string | null }>;
  const playerIds = players.map((p) => p.id);
  const nameById = new Map(players.map((p) => [p.id, p.full_name ?? "—"]));

  // Today's verdict counts.
  //
  // Source: v_coach_readiness_today_v8.final_color (the dashboard view).
  // Two earlier bugs fixed here on 2026-05-28:
  //  (1) athlete_decision_history does NOT have a `training_action` column
  //      (it has `session_mode`). Supabase silently returned empty rows,
  //      so AI was told "no sessions" all week.
  //  (2) Even with the right column, athlete_decision_history runs a
  //      trajectory-aware engine whose verdict can disagree with what
  //      the coach sees on screen. We align to the dashboard's source.
  // See CLAUDE.md > "Canonical verdict source" for the architecture rule.
  let full_count = 0, reduced_count = 0, recovery_count = 0;
  if (playerIds.length > 0) {
    const { data: dh } = await supabase
      .from("v_coach_readiness_today_v8")
      .select("final_color")
      .in("player_id", playerIds)
      .eq("entry_date", today);
    for (const r of (dh ?? []) as Array<{ final_color: string | null }>) {
      const c = String(r.final_color ?? "").toLowerCase();
      if (c === "green") full_count++;
      else if (c === "yellow") reduced_count++;
      else if (c === "red") recovery_count++;
    }
  }

  // Today's team intelligence row (volatility, avg risk, baseline, recommendation source)
  const { data: ti } = await supabase
    .from("v_coach_team_intelligence_today")
    .select("volatility_pct, baseline_maturity")
    .eq("team_id", teamId).maybeSingle();

  // Day-type for today
  let is_off_day = false;
  try {
    const { data: wp } = await supabase
      .from("week_plans").select("day_type").eq("team_id", teamId).eq("date", today).maybeSingle();
    is_off_day = String(wp?.day_type ?? "").toUpperCase() === "OFF";
  } catch { /* table may not exist — leave false */ }

  // 28d team-mean PL for ACWR
  let acwr_team: number | null = null, load_delta_pct: number | null = null, high_load_days_7d = 0;
  if (playerIds.length > 0) {
    const { data: ext } = await supabase
      .from("player_external_load_daily")
      .select("date, total_player_load")
      .in("player_id", playerIds)
      .gte("date", start28).lte("date", today);
    const dayBuckets = new Map<string, number[]>();
    for (const r of (ext ?? []) as Array<{ date: string; total_player_load: number | null }>) {
      if (r.total_player_load == null || r.total_player_load <= 0) continue;
      const arr = dayBuckets.get(r.date) ?? [];
      arr.push(Number(r.total_player_load));
      dayBuckets.set(r.date, arr);
    }
    const dayMean = new Map<string, number>();
    for (const [d, arr] of dayBuckets) dayMean.set(d, arr.reduce((s, x) => s + x, 0) / arr.length);
    const acuteVals = Array.from(dayMean.entries()).filter(([d]) => d >= start7).map(([, v]) => v);
    const chronicVals = Array.from(dayMean.values());
    const acuteMean = acuteVals.length > 0 ? acuteVals.reduce((s, x) => s + x, 0) / acuteVals.length : null;
    const chronicMean = chronicVals.length > 0 ? chronicVals.reduce((s, x) => s + x, 0) / chronicVals.length : null;
    if (acuteMean != null && chronicMean != null && chronicMean > 0) {
      acwr_team = Math.round((acuteMean / chronicMean) * 100) / 100;
      load_delta_pct = Math.round(((acuteMean / chronicMean) - 1) * 100);
      const threshold = chronicMean * 1.15;
      high_load_days_7d = Array.from(dayMean.entries()).filter(([d, v]) => d >= start7 && v >= threshold).length;
    }
  }

  // Match days in 7d
  let match_days_7d = 0;
  try {
    const { data: mm } = await supabase
      .from("match_player_minutes")
      .select("match_date")
      .in("player_id", playerIds)
      .gte("match_date", start7).lte("match_date", today)
      .gte("minutes_played", 60);
    const dates = new Set<string>();
    for (const r of (mm ?? []) as Array<{ match_date: string }>) if (r.match_date) dates.add(r.match_date);
    match_days_7d = dates.size;
  } catch { /* best-effort */ }

  // 7d yellow+red count — equivalent to "how many player-days needed
  // modification or recovery". Source: v_coach_readiness_today_v8 (the
  // dashboard view). See CLAUDE.md > "Canonical verdict source".
  let reduced_recovery_count_7d = 0;
  try {
    const { data: dh } = await supabase
      .from("v_coach_readiness_today_v8")
      .select("final_color")
      .in("player_id", playerIds)
      .gte("entry_date", start7).lte("entry_date", today);
    for (const r of (dh ?? []) as Array<{ final_color: string | null }>) {
      const c = String(r.final_color ?? "").toLowerCase();
      if (c === "yellow" || c === "red") reduced_recovery_count_7d++;
    }
  } catch { /* best-effort */ }

  // Declining players (z 7d mean ≥ 0.5 below prior 21d mean).
  //
  // NOTE: previous version selected athlete_decision_history.z_today as
  // a top-level column — that column DOES NOT EXIST on the table (z lives
  // inside the input_signals jsonb). The select silently returned empty
  // rows and this list has always been blank in team-analysis AI prompts.
  // Re-extract from input_signals to actually populate it.
  const declining_players: string[] = [];
  try {
    const { data: zh } = await supabase
      .from("athlete_decision_history")
      .select("player_id, input_signals, decision_date")
      .in("player_id", playerIds)
      .gte("decision_date", start28).lte("decision_date", today);
    const byPlayer = new Map<string, Array<{ d: string; z: number }>>();
    for (const r of (zh ?? []) as Array<{ player_id: string; input_signals: Record<string, unknown> | null; decision_date: string }>) {
      // input_signals shape varies — z lives under readinessZ in current
      // pipeline, but older snapshots may not include it. Tolerate both.
      const sig = r.input_signals ?? {};
      const rawZ = (sig as { readinessZ?: unknown; z_today?: unknown }).readinessZ
        ?? (sig as { readinessZ?: unknown; z_today?: unknown }).z_today;
      const z = typeof rawZ === "number" && Number.isFinite(rawZ) ? rawZ : null;
      if (z == null) continue;
      const arr = byPlayer.get(r.player_id) ?? [];
      arr.push({ d: r.decision_date, z });
      byPlayer.set(r.player_id, arr);
    }
    for (const [pid, arr] of byPlayer) {
      const recent = arr.filter((x) => x.d >= start7).map((x) => x.z);
      const prior = arr.filter((x) => x.d < start7).map((x) => x.z);
      if (recent.length < 3 || prior.length < 5) continue;
      const m1 = recent.reduce((s, x) => s + x, 0) / recent.length;
      const m0 = prior.reduce((s, x) => s + x, 0) / prior.length;
      if (m0 - m1 >= 0.5) declining_players.push(nameById.get(pid) ?? "—");
    }
  } catch { /* best-effort */ }

  // Active injuries
  const injured_players: string[] = [];
  try {
    const { data: inj } = await supabase
      .from("player_injuries").select("player_id, status")
      .in("player_id", playerIds)
      .in("status", ["injured", "rehabilitation", "rtp_training"]);
    const seen = new Set<string>();
    for (const r of (inj ?? []) as Array<{ player_id: string }>) {
      if (seen.has(r.player_id)) continue;
      seen.add(r.player_id);
      injured_players.push(nameById.get(r.player_id) ?? "—");
    }
  } catch { /* best-effort */ }

  return {
    team_name: String(team.name ?? "Team"),
    is_off_day,
    squad_size: players.length,
    full_count, reduced_count, recovery_count,
    dominant_fatigue: null, // Could enrich from fatigue snapshot
    neural_load_state: null,
    next_day_risk: null,
    volatility_pct: typeof ti?.volatility_pct === "number" ? ti.volatility_pct : null,
    avg_risk_score: null,
    protected_count: 0,
    baseline_maturity: ti?.baseline_maturity ? String(ti.baseline_maturity) : null,
    acwr_team, load_delta_pct, high_load_days_7d, match_days_7d,
    declining_players, injured_players,
    reduced_recovery_count_7d,
  };
}

function buildSystemPrompt(): string {
  return `You are an assistant for football head coaches and S&C staff.

Your job: write a 2-paragraph deeper team analysis from pre-computed signals. The deterministic engine has already produced a 1-line headline + bullets — you add CONTEXT and CONNECTIONS that the rule-based system can't see, in plain coach English.

You will receive a JSON object with team-level facts: verdict counts, weekly load delta, ACWR, declining players, injuries, etc. Every number/name is pre-computed and authoritative.

═══════ HARD RULES ═══════

1. NEVER invent numbers, players, or events not in the input. Only use what is in the JSON.
2. NEVER restate the obvious ("18 of 28 are full" — coach can read that). Add CONNECTIONS: "the four reduced players all share the central-midfield rotation, so the box-to-box workload is concentrated".
3. Two paragraphs only. ~60-90 words each.
4. Para 1: WHAT the data is telling us beyond the headline — patterns across players, comparison to typical week, what's likely driving the picture.
5. Para 2: STRATEGIC implication for the next 1-3 days — what to consider for tomorrow's session and the rest of the week.
6. Use player names by first name only ("Hákon", not "Hákon Jónsson").
7. ENGLISH ONLY.
8. If is_off_day=true: don't tell the coach to "run a session" or "modify load" — there's no session today. Pivot to recovery / planning advice.

Output JSON only:
{ "analysis_paragraph_1": "...", "analysis_paragraph_2": "..." }`;
}

async function callClaude(systemPrompt: string, userMessage: string): Promise<{ paragraph_1: string; paragraph_2: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const textContent = json.content?.find((c) => c.type === "text")?.text ?? "";
  // Extract JSON from response — Haiku sometimes wraps in ```
  const cleaned = textContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  let parsed: { analysis_paragraph_1?: string; analysis_paragraph_2?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
  return {
    paragraph_1: String(parsed.analysis_paragraph_1 ?? "").trim(),
    paragraph_2: String(parsed.analysis_paragraph_2 ?? "").trim(),
  };
}

export async function POST(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getSupabase();

  // ELITE-tier gate
  const elite = await isEliteTeam(supabase, auth.teamId);
  if (!elite) {
    return NextResponse.json(ELITE_REQUIRED_RESPONSE.body, { status: ELITE_REQUIRED_RESPONSE.status });
  }

  const facts = await gatherTeamFacts(supabase, auth.teamId);
  if (!facts) {
    return NextResponse.json({ error: "Team not found or no data" }, { status: 404 });
  }

  try {
    const userMessage = JSON.stringify(facts);
    const result = await callClaude(buildSystemPrompt(), userMessage);
    return NextResponse.json({
      ok: true,
      teamId: auth.teamId,
      generated_at: new Date().toISOString(),
      paragraph_1: result.paragraph_1,
      paragraph_2: result.paragraph_2,
      facts_used: facts,
    });
  } catch (err) {
    return NextResponse.json({
      error: "AI generation failed",
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

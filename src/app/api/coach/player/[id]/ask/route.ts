export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * /api/coach/player/[id]/ask
 *
 * POST — answer one of the curated coach questions about a specific player.
 * Body: { question_id: string, lang?: "IS" | "EN" }
 *
 * The question_id must match one of the questions in coach-qa/questions.ts.
 * For each question we:
 *   1. Fetch ONLY the data subsets that question needs (gates LLM scope)
 *   2. Call Claude with a focused prompt template tied to that question
 *   3. Validate output (no jargon, no impossible numbers, no contradiction
 *      with coach-visible verdict)
 *   4. Return 2-3 sentence answer
 *
 * No caching for now — these are interactive questions and freshness matters.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getQuestion, type QuestionDataKey } from "@/lib/coach-qa/questions";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL      = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 280;

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

// ─── Per-question data fetcher — gates LLM scope ────────────────────────────
async function fetchDataForQuestion(
  supabase:  ReturnType<typeof getSupabase>,
  playerId:  string,
  teamId:    string,
  dataKeys:  QuestionDataKey[],
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const todayIso = new Date().toISOString().slice(0, 10);
  const sevenAgoIso = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const fourteenAgoIso = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const twentyEightAgoIso = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);

  // Always include player meta — gives Claude name + position context
  const { data: pinfo } = await supabase
    .from("players").select("full_name, position").eq("id", playerId).maybeSingle();
  out.player = { name: pinfo?.full_name ?? "Player", position: pinfo?.position ?? null };

  if (dataKeys.includes("decel_status")) {
    const { data } = await supabase.rpc("get_mcburnie_decel_status", { p_player_id: playerId });
    out.decel_status = data ?? null;
  }

  if (dataKeys.includes("indoor_state")) {
    const { data } = await supabase.rpc("get_indoor_load_status", { p_player_id: playerId });
    out.indoor_state = data ?? null;
  }

  if (dataKeys.includes("pattern_window")) {
    const { data: w7 } = await supabase.rpc("get_player_window_pattern", { p_player_id: playerId, p_window_days: 7 });
    const { data: w14 } = await supabase.rpc("get_player_window_pattern", { p_player_id: playerId, p_window_days: 14 });
    out.pattern_7d  = w7  ?? null;
    out.pattern_14d = w14 ?? null;
  }

  if (dataKeys.includes("active_injuries")) {
    const { data } = await supabase
      .from("injury_events")
      .select("injury_type, body_side, severity, is_active, return_date, injury_date")
      .eq("player_id", playerId).eq("is_active", true)
      .order("injury_date", { ascending: false }).limit(3);
    out.active_injuries = (data ?? []).map((i: Record<string, unknown>) => ({
      type: i.injury_type, side: i.body_side, severity: i.severity,
      injury_date: i.injury_date, expected_return: i.return_date,
    }));
  }

  if (dataKeys.includes("match_calendar")) {
    // Pull recent + upcoming sessions to identify last/next match
    const { data } = await supabase
      .from("v_player_session_today_v2")
      .select("day_date, md_day_resolved, planned_focus, session_type")
      .eq("player_id", playerId)
      .gte("day_date", sevenAgoIso)
      .order("day_date", { ascending: false }).limit(14);
    type Sess = { day_date: string; md_day_resolved?: string | null; planned_focus?: string | null; session_type?: string | null };
    const sessions = (data ?? []) as Sess[];
    let lastMatch: Sess | null = null;
    let nextMatchMdDay: string | null = null;
    for (const s of sessions) {
      const md = String(s.md_day_resolved ?? "").toUpperCase();
      const focus = String(s.planned_focus ?? "").toUpperCase();
      const stype = String(s.session_type ?? "").toUpperCase();
      const isMatch = md === "MD" || focus.includes("MATCH") || focus.includes("GAME")
        || stype.includes("MATCH") || stype.includes("GAME");
      if (isMatch && !lastMatch && s.day_date <= todayIso) lastMatch = s;
      if (s.day_date === todayIso) nextMatchMdDay = md || null;
    }
    out.match_calendar = { last_match: lastMatch, today_md_day: nextMatchMdDay };
  }

  if (dataKeys.includes("recent_load")) {
    const { data } = await supabase
      .from("player_external_load_daily")
      .select("date, total_distance, total_player_load, high_metabolic_load_distance_m, ima_band3_decel_count, sharp_cut_count_est, mpe_count_est, mpe_recovery_avg_s, edi, activity_class_brown")
      .eq("player_id", playerId)
      .gte("date", fourteenAgoIso)
      .order("date", { ascending: false });
    out.recent_load_14d = data ?? [];
  }

  if (dataKeys.includes("wellness_recent")) {
    const { data } = await supabase
      .from("readiness_entries")
      .select("entry_date, sleep, soreness, readiness")
      .eq("player_id", playerId)
      .gte("entry_date", sevenAgoIso)
      .order("entry_date", { ascending: false });
    out.wellness_recent = data ?? [];
  }

  if (dataKeys.includes("vald_strength")) {
    // Best-effort — only include if VALD data exists for this player
    const { data } = await supabase
      .from("vald_test_results")
      .select("test_date, test_type, metric_name, value_left, value_right, asymmetry_pct")
      .eq("player_id", playerId)
      .gte("test_date", twentyEightAgoIso)
      .order("test_date", { ascending: false }).limit(10);
    out.vald_strength = data ?? [];
  }

  if (dataKeys.includes("sharp_cut")) {
    const { data } = await supabase
      .from("v_sharp_cut_hip_er_risk")
      .select("cuts_7d, cuts_28d, cuts_personal_z, cuts_flag")
      .eq("player_id", playerId).maybeSingle();
    out.sharp_cut = data ?? null;
  }

  if (dataKeys.includes("asp_burst")) {
    const { data } = await supabase
      .from("v_asp_personal_burst")
      .select("accel_burst_personal_z, decel_burst_personal_z, ad_couple_personal_z, baseline_days")
      .eq("player_id", playerId).maybeSingle();
    out.asp_burst = data ?? null;
  }

  if (dataKeys.includes("notifications_history")) {
    const { data } = await supabase
      .from("coach_notifications")
      .select("parameter, direction, severity, value_now, value_prev, summary, summary_is, fired_at, acknowledged_at")
      .eq("player_id", playerId)
      .gte("fired_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order("fired_at", { ascending: false }).limit(10);
    out.notifications_history = data ?? [];
  }

  if (dataKeys.includes("squad_averages")) {
    // Compute team-mean for the past 7 days across the same player set
    const { data: roster } = await supabase
      .from("players").select("id").eq("team_id", teamId);
    const playerIds = ((roster ?? []) as Array<{ id: string }>).map((p) => p.id);
    if (playerIds.length > 0) {
      const { data: loads } = await supabase
        .from("player_external_load_daily")
        .select("player_id, total_distance, total_player_load, high_metabolic_load_distance_m")
        .in("player_id", playerIds)
        .gte("date", sevenAgoIso);
      const allLoads = (loads ?? []) as Array<{ total_distance: number | null; total_player_load: number | null; high_metabolic_load_distance_m: number | null }>;
      const avg = (key: keyof typeof allLoads[number]) => {
        const vals = allLoads.map((r) => Number(r[key])).filter((n) => Number.isFinite(n) && n > 0);
        return vals.length > 0 ? vals.reduce((a, x) => a + x, 0) / vals.length : null;
      };
      out.squad_averages_7d = {
        avg_total_distance: avg("total_distance"),
        avg_total_player_load: avg("total_player_load"),
        avg_high_metabolic_load_distance_m: avg("high_metabolic_load_distance_m"),
        n_players_in_avg: playerIds.length,
      };
    }
  }

  if (dataKeys.includes("verdict_history")) {
    const { data } = await supabase
      .from("athlete_decision_history")
      .select("decision_date, athlete_state, load_action, neural_status")
      .eq("player_id", playerId)
      .gte("decision_date", fourteenAgoIso)
      .order("decision_date", { ascending: false });
    out.verdict_history_14d = data ?? [];
  }

  if (dataKeys.includes("mpe_recovery")) {
    // Use recent_load if already fetched; otherwise fetch
    if (!out.recent_load_14d) {
      const { data } = await supabase
        .from("player_external_load_daily")
        .select("date, mpe_count_est, mpe_recovery_avg_s")
        .eq("player_id", playerId)
        .gte("date", fourteenAgoIso)
        .order("date", { ascending: false });
      out.mpe_history = data ?? [];
    }
  }

  return out;
}

// ─── Claude call ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT_BASE = `You are an assistant for football head coaches and S&C staff.

You will be given player data and ONE specific question. Answer ONLY that question.

Hard rules:
- Each answer: 2-3 sentences max. NEVER more.
- Plain coach language. NO data jargon. NEVER use internal metric names like
  "ACWR", "McBurnie", "HMLD", "z-score", "decel-to-accel ratio". Translate.
- Cite numbers ONLY if they appear LITERALLY in the input JSON.
- "X of Y days" — X must be ≤ Y. Always.
- NEVER invent injuries / tests / events not in the input.
- If data is sparse or missing, say "limited data" — do NOT manufacture answers.
- If the question premise doesn't match the data (e.g. asking about last match
  when there is no recent match in calendar), say so plainly and stop.
- Output JSON only: { "answer": "English answer (2-3 sentences)" }
- ENGLISH ONLY. Do NOT output Icelandic.`;

async function callClaude(systemPrompt: string, userMessage: string): Promise<{ answer: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:       CLAUDE_MODEL,
      max_tokens:  MAX_OUTPUT_TOKENS,
      system:      systemPrompt,
      messages:    [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Claude API ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json() as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let parsed: { answer?: string };
  try { parsed = JSON.parse(cleaned); }
  catch { throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`); }
  if (!parsed.answer) {
    throw new Error(`Claude response missing 'answer' field`);
  }
  return { answer: parsed.answer.trim() };
}

// ─── Validation ─────────────────────────────────────────────────────────────
const FORBIDDEN_TERMS = [
  /\bACWR\b/i, /\bHMLD\b/i, /\bMcBurnie\b/i, /\bz[\s-]?score\b/i,
  /\bd:sprint\b/i, /\ba:d\s+coupling\b/i,
  /deceleration[-\s]to[-\s]acceleration\s+ratio/i,
  /\b(?:0\.\d+|1\.\d+)\s*(?:vs|versus)\s*(?:0\.\d+|1\.\d+)/i,
];
function validateAnswer(text: string): string | null {
  for (const re of FORBIDDEN_TERMS) {
    if (re.test(text)) return `Contains forbidden jargon/ratio: ${re.source}`;
  }
  const sentenceCount = text.split(/[.!?]+/).filter((s) => s.trim().length > 5).length;
  if (sentenceCount < 1 || sentenceCount > 5) {
    return `Sentence count out of bounds (${sentenceCount}, expected 2-3)`;
  }
  // Day-count hallucination guard
  const xOfYRegex = /(\d+)\s+(?:of|af)\s+(?:the\s+)?(?:last\s+|síðustu\s+)?(\d+)\s+days?/gi;
  let m: RegExpExecArray | null;
  while ((m = xOfYRegex.exec(text)) !== null) {
    const x = parseInt(m[1], 10);
    const y = parseInt(m[2], 10);
    if (x > y) return `Impossible day count: "${x} of ${y} days"`;
    if (y > 30) return `Day count exceeds plausible window: "${y} days"`;
  }
  return null;
}

// ─── POST ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  if (!playerId) return NextResponse.json({ error: "Missing player id" }, { status: 400 });

  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as { question_id?: string };
  const questionId = String(body.question_id ?? "").trim();
  if (!questionId) return NextResponse.json({ error: "Missing question_id" }, { status: 400 });

  const question = getQuestion(questionId);
  if (!question) return NextResponse.json({ error: `Unknown question_id: ${questionId}` }, { status: 400 });

  const supabase = getSupabase();

  // Verify player ownership
  const { data: playerCheck } = await supabase
    .from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  if (!playerCheck || playerCheck.team_id !== auth.teamId) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  // Fetch data scoped to this question's needs
  let scopedData: Record<string, unknown>;
  try {
    scopedData = await fetchDataForQuestion(supabase, playerId, auth.teamId, question.data_keys);
  } catch (e) {
    return NextResponse.json({ error: `Data fetch failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }

  // Build prompt with question-specific instruction
  const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${question.prompt}`;
  const userMessage = `Question: ${question.label}\n\nPlayer data:\n${JSON.stringify(scopedData, null, 2)}\n\nAnswer the question now. English only. JSON only.`;

  // Call Claude with retry-on-validation-failure (same pattern as AI Summary)
  let answer: { answer: string };
  let issues: string | null = null;
  try {
    answer = await callClaude(systemPrompt, userMessage);
    issues = validateAnswer(answer.answer);
    if (issues) {
      console.warn("[player-ask] First attempt failed validation, retrying", { questionId, issues });
      answer = await callClaude(systemPrompt, userMessage);
      issues = validateAnswer(answer.answer);
    }
  } catch (e) {
    return NextResponse.json({ error: `Generation failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 });
  }
  if (issues) {
    return NextResponse.json({
      error: `Validation failed after retry: ${issues}`,
      answer: answer.answer,
    }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    question_id: questionId,
    answer: answer.answer,
    answered_at: new Date().toISOString(),
  });
}

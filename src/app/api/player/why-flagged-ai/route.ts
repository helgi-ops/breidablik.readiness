/**
 * /api/player/why-flagged-ai
 *
 * POST — generates an AI-written explanation of WHY the calling player is
 * flagged (yellow or red) today, spoken to the player in second-person.
 *
 * This is the player-side mirror of /api/coach/player/[id]/ask with
 * question_id="why_flagged". Differences:
 *   - Authenticates the player (not a coach); player can only ask about
 *     themselves.
 *   - System prompt rewritten in second-person ("you / your") so the
 *     answer reads as a direct address to the player.
 *   - Scoped to the 5 data signals the why_flagged question needs
 *     (wellness, recent load, decel status, active injuries, verdict
 *     history) — same envelope as the coach endpoint, no broader scope.
 *
 * Same ELITE-gating, same anti-hallucination validation + retry. The
 * data fetcher here is a focused subset of the one in the coach endpoint
 * — only the 5 data keys this question needs are implemented. If we add
 * more player-self questions in future this should be factored out.
 *
 * Aligns with explainability-first principle #5 (AI explains, rules
 * decide) and brings player surface to parity with coach surface.
 */

export const runtime = "nodejs";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getQuestion } from "@/lib/coach-qa/questions";
import { isEliteTeam, ELITE_REQUIRED_RESPONSE } from "@/lib/micropulse/elite";

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

// ── Auth: resolve player from their own session ────────────────────────────
async function resolvePlayerContext(
  req: NextRequest,
): Promise<{ playerId: string; teamId: string } | { error: string; status: number }> {
  const supabase = getSupabase();
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 };

  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("player_id, team_id")
    .eq("id", userId)
    .maybeSingle();

  const playerId = (prof as { player_id?: string | null } | null)?.player_id;
  let teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  if (!playerId) return { error: "Profile not linked to a player", status: 403 };

  if (!teamId) {
    const { data: playerRow } = await supabase
      .from("players")
      .select("team_id")
      .eq("id", playerId)
      .maybeSingle();
    teamId = (playerRow as { team_id?: string | null } | null)?.team_id ?? null;
  }
  if (!teamId) return { error: "Player not linked to a team", status: 400 };

  return { playerId, teamId };
}

// ── Data fetcher — scoped to why_flagged's 5 data_keys only ────────────────
// Subset of the coach endpoint's fetcher. Kept focused so the LLM scope
// stays tight. Adding new player-self questions later should factor this
// out into src/lib/coach-qa/data-fetcher.ts shared with the coach route.
async function fetchDataForWhyFlagged(
  supabase: ReturnType<typeof getSupabase>,
  playerId: string,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const todayIso = new Date().toISOString().slice(0, 10);
  const sevenAgoIso = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const fourteenAgoIso = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);

  // Player meta — gives Claude name + position context. The player IS
  // the asker so first-person pronouns will be used, but having the name
  // helps Claude write naturally ("Your soreness was 2/5...").
  const { data: pinfo } = await supabase
    .from("players").select("full_name, position").eq("id", playerId).maybeSingle();
  out.player = {
    name: pinfo?.full_name ?? "Player",
    position: pinfo?.position ?? null,
  };

  // (1) wellness_recent — last 14 days of check-ins (the player's own
  // ratings — gives baseline + today's reading)
  const { data: wellness } = await supabase
    .from("readiness_entries")
    .select("entry_date, total_score, sleep_quality, fatigue_energy, stress_mood, muscle_soreness")
    .eq("player_id", playerId)
    .gte("entry_date", fourteenAgoIso)
    .order("entry_date", { ascending: false })
    .limit(14);
  out.wellness_recent_14d = wellness ?? [];

  // (2) recent_load — last 14 days of GPS / external load (drives the
  // "but your training was 73% above usual" line in the answer)
  const { data: load } = await supabase
    .from("player_external_load_daily")
    .select("date, total_distance, total_player_load, hsr_meters_v5_plus, sprint_meters_v6_plus, high_metabolic_load_distance_m")
    .eq("player_id", playerId)
    .gte("date", fourteenAgoIso)
    .order("date", { ascending: false });
  out.recent_load_14d = load ?? [];

  // (3) decel_status — mechanical-load read for HIR/decel exposure
  try {
    const { data } = await supabase.rpc("get_mcburnie_decel_status", { p_player_id: playerId });
    out.decel_status = data ?? null;
  } catch {
    out.decel_status = null;
  }

  // (4) active_injuries — leads the answer if the player is in the
  // injury pipeline (overrides the readings analysis)
  const { data: inj } = await supabase
    .from("injury_events")
    .select("injury_type, body_side, severity, is_active, injury_date, return_date")
    .eq("player_id", playerId).eq("is_active", true)
    .order("injury_date", { ascending: false })
    .limit(3);
  out.active_injuries = (inj ?? []).map((r: Record<string, unknown>) => ({
    type: r.injury_type, side: r.body_side, severity: r.severity,
    injury_date: r.injury_date, expected_return: r.return_date,
  }));

  // (5) verdict_history — last 14 days of athlete state for "you've been
  // yellow for 3 days, not just today" context
  const { data: vh } = await supabase
    .from("athlete_decision_history")
    .select("decision_date, athlete_state, load_action, neural_status")
    .eq("player_id", playerId)
    .gte("decision_date", fourteenAgoIso)
    .order("decision_date", { ascending: false });
  out.verdict_history_14d = vh ?? [];

  // Tiny metric-definitions block — anti-confusion footer the validator
  // checks against (HSR vs HMLD trap from the coach endpoint history).
  out.metric_definitions = {
    total_player_load: "AU per day. Their movement load.",
    hsr_meters_v5_plus: "High-speed running distance (above ~19.8 km/h).",
    sprint_meters_v6_plus: "Sprint distance (above ~25.2 km/h).",
    high_metabolic_load_distance_m: "Power-based, not speed-based. Never call this HIR.",
    today: todayIso,
    seven_days_ago: sevenAgoIso,
  };

  return out;
}

// ── Player-voice system prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT_PLAYER = `You are an assistant talking DIRECTLY to a football player about their own readiness status today.

You will be given the player's own data and one question: "Why am I flagged (yellow or red) today?".

Hard rules:
- Each answer: 2-3 sentences max. NEVER more.
- Speak DIRECTLY to the player. Use "you" and "your", NEVER "he/his/the player". The player IS the audience.
- Plain player language. NO data jargon. NEVER use internal metric names like
  "ACWR", "McBurnie", "HMLD", "z-score", "composite", "personal baseline z".
  Translate everything ("your sleep score", "your training load yesterday",
  "what you usually feel like").
- Cite numbers ONLY if they appear LITERALLY in the input JSON. Never average,
  round dramatically, or compute new totals.
- A 'metric_definitions' block in the input tells you what each field means.
- If you reference high-speed running, use 'hsr_meters_v5_plus'. NEVER use
  'high_metabolic_load_distance_m' as if it were HIR.
- If today's verdict is GREEN (athlete_state in verdict_history_14d[0]), say
  "You're clear today — no flag" and stop.
- If the player has an active injury, lead with that. ("You're flagged because
  of your active [body-part] injury, not your readings.").
- Be honest, supportive, never alarmist. The player is reading this on their
  phone. Avoid medical-style language.
- Output JSON only: { "answer": "2-3 sentence answer addressed to the player" }
- ENGLISH ONLY. Do NOT output Icelandic.`;

// ── Claude call ────────────────────────────────────────────────────────────
async function callClaude(systemPrompt: string, userMessage: string): Promise<{ answer: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
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
  if (!parsed.answer) throw new Error("Claude response missing 'answer' field");
  return { answer: parsed.answer.trim() };
}

// ── Validation — same anti-jargon + HIR/HMLD guard as coach side ───────────
const FORBIDDEN_TERMS = [
  /\bACWR\b/i, /\bHMLD\b/i, /\bMcBurnie\b/i, /\bz[\s-]?score\b/i,
  /\bd:sprint\b/i, /\ba:d\s+coupling\b/i,
  /deceleration[-\s]to[-\s]acceleration\s+ratio/i,
];
function validateAnswer(text: string, scopedData?: Record<string, unknown>): string | null {
  for (const re of FORBIDDEN_TERMS) {
    if (re.test(text)) return `Contains forbidden jargon: ${re.source}`;
  }
  // Sentence count: 1-5 (allow some slack for the player voice)
  const sentenceCount = text.split(/[.!?]+/).filter((s) => s.trim().length > 5).length;
  if (sentenceCount < 1 || sentenceCount > 5) {
    return `Sentence count out of bounds (${sentenceCount}, expected 2-3)`;
  }
  // Second-person voice check: must NOT use "he/his/the player" — the
  // whole point of this endpoint is that it speaks TO the player.
  if (/\b(he|his|the player|the athlete)\b/i.test(text)) {
    return `Wrong voice: used third-person ("he/his/the player"). Must use "you/your".`;
  }
  // HIR-vs-HMLD substitution guard — same trap as the coach endpoint.
  if (scopedData) {
    const loadRows = (scopedData.recent_load_14d as Array<Record<string, number | null>> | undefined) ?? [];
    const validHirNumbers = new Set<number>();
    for (const r of loadRows) {
      for (const k of ["hsr_meters_v5_plus", "sprint_meters_v6_plus"]) {
        const v = r?.[k];
        if (typeof v === "number" && v > 0) validHirNumbers.add(Math.round(v));
      }
    }
    const hirRegex = /(\d{2,5}(?:\.\d+)?)\s*(?:m|meters?|metres?)?\s*(?:of\s+)?(?:high[-\s]intensity\s+running|high[-\s]speed\s+running|HIR|HSR|sprint(?:ing|\s+distance)?)/gi;
    let h: RegExpExecArray | null;
    while ((h = hirRegex.exec(text)) !== null) {
      const cited = parseFloat(h[1]);
      if (!Number.isFinite(cited)) continue;
      const matched = Array.from(validHirNumbers).some(
        (v) => Math.abs(cited - v) <= Math.max(15, v * 0.1),
      );
      if (!matched) {
        const hmldNumbers = loadRows
          .map((r) => r?.high_metabolic_load_distance_m)
          .filter((v): v is number => typeof v === "number" && v > 0)
          .map((v) => Math.round(v));
        const isHmld = hmldNumbers.some((v) => Math.abs(cited - v) <= Math.max(50, v * 0.1));
        return isHmld
          ? `HIR cited as ${cited}m matches HMLD, not actual HSR.`
          : `HIR cited as ${cited}m doesn't match any real HSR value.`;
      }
    }
  }
  return null;
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ctx = await resolvePlayerContext(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const supabase = getSupabase();

  // ELITE-tier gate — same as the coach endpoint.
  const isElite = await isEliteTeam(supabase, ctx.teamId);
  if (!isElite) {
    return NextResponse.json(ELITE_REQUIRED_RESPONSE.body, { status: ELITE_REQUIRED_RESPONSE.status });
  }

  // The question is fixed: "why am I flagged today?". We pull the prompt
  // body from the curated library so the answer stays consistent with
  // the coach endpoint's why_flagged response.
  const question = getQuestion("why_flagged");
  if (!question) {
    return NextResponse.json({ error: "why_flagged question not configured" }, { status: 500 });
  }

  // Fetch the player's own data
  let scopedData: Record<string, unknown>;
  try {
    scopedData = await fetchDataForWhyFlagged(supabase, ctx.playerId);
  } catch (e) {
    return NextResponse.json({
      error: `Data fetch failed: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 500 });
  }

  // Build the prompt: player-voice system prompt + the curated question
  // body (which already has the "name the dominant driver, etc." structure).
  const systemPrompt = `${SYSTEM_PROMPT_PLAYER}\n\n${question.prompt}`;
  const userMessage = `Question: Why am I flagged today?\n\nYour data:\n${JSON.stringify(scopedData, null, 2)}\n\nAnswer the question now. Speak to me directly using "you/your". English only. JSON only.`;

  // Call Claude with retry-on-validation-failure (mirrors coach endpoint).
  let answer: { answer: string };
  let issues: string | null = null;
  try {
    answer = await callClaude(systemPrompt, userMessage);
    issues = validateAnswer(answer.answer, scopedData);
    if (issues) {
      console.warn("[player-why-flagged-ai] First attempt failed validation, retrying", { issues });
      const retryHint = issues.includes("voice")
        ? `\n\nIMPORTANT: Your previous attempt used third-person voice ("he", "his", "the player"). Rewrite addressing the player DIRECTLY ("you", "your"). The player is reading your answer on their phone.`
        : issues.includes("HMLD")
          ? `\n\nIMPORTANT: Your previous attempt confused 'high_metabolic_load_distance_m' (HMLD, power-based) with HIR/HSR. HIR is in 'hsr_meters_v5_plus'. NEVER call HMLD high-intensity running.`
          : `\n\nYour previous answer failed validation: ${issues}. Re-read the rules.`;
      answer = await callClaude(systemPrompt, userMessage + retryHint);
      issues = validateAnswer(answer.answer, scopedData);
    }
  } catch (e) {
    return NextResponse.json({
      error: `Generation failed: ${e instanceof Error ? e.message : String(e)}`,
    }, { status: 500 });
  }
  if (issues) {
    return NextResponse.json({
      error: `Validation failed after retry: ${issues}`,
      answer: answer.answer,
    }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    answer: answer.answer,
    answered_at: new Date().toISOString(),
  });
}

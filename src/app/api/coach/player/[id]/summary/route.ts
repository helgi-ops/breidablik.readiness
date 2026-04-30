export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * /api/coach/player/[id]/summary?window=7|14
 *
 * AI-generated narrative summary per player. Synthesises:
 *   - current snapshot (McBurnie status, recent load, injury status)
 *   - rolling pattern (concerning-day count, recurring offenders, trajectory,
 *     persistent self-reports — from get_player_window_pattern)
 * into a 3-4 sentence plain-language coach summary in IS + EN.
 *
 * Uses Claude Haiku (fast, cheap, sufficient for short narrative). Output is
 * cached in player_daily_summary for 24h to avoid redundant API calls.
 *
 * GET — read cached summary (or generate if missing)
 * POST — force regeneration (bypasses cache)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const ANTHROPIC_API_URL  = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL       = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS  = 350;

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
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 };
  }
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 };
  return { userId, teamId };
}

type CoachVerdictInput = {
  state?:        string;
  headline?:     string;
  why_lines?:    string[];
  action?:       string;
} | null;

// ─── Build the structured input that goes to Claude ─────────────────────────
async function buildSummaryInput(
  supabase:    ReturnType<typeof getSupabase>,
  playerId:    string,
  windowDays:  7 | 14,
  coachVerdict: CoachVerdictInput = null,
) {
  // Window dates for the pattern/EDI/MPE windows
  const windowStart = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);
  const threeDaysAgoIso = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

  const [
    pattern,
    mcburnie,
    injuries,
    indoorStatus,
    playerInfo,
    sharpCut,
    aspBurst,
    extLoadWindow,
    recentSessions,
  ] = await Promise.all([
    supabase.rpc("get_player_window_pattern", { p_player_id: playerId, p_window_days: windowDays }),
    supabase.rpc("get_mcburnie_decel_status",  { p_player_id: playerId }),
    supabase
      .from("injury_events")
      .select("injury_type, body_side, severity, is_active, return_date, injury_date")
      .eq("player_id", playerId)
      .eq("is_active", true)
      .order("injury_date", { ascending: false })
      .limit(3),
    supabase.rpc("get_indoor_load_status", { p_player_id: playerId }),
    supabase.from("players").select("full_name, position").eq("id", playerId).maybeSingle(),
    // Dos'Santos 2021 — Sharp Cut Load (proxy via IMA Band 3 decel)
    supabase
      .from("v_sharp_cut_hip_er_risk")
      .select("cuts_7d, cuts_28d, cuts_personal_z, cuts_flag")
      .eq("player_id", playerId)
      .maybeSingle(),
    // Osgnach 2023 ASP-spirit personal-burst z-scoring
    supabase
      .from("v_asp_personal_burst")
      .select("accel_burst_personal_z, decel_burst_personal_z, ad_couple_personal_z, baseline_days")
      .eq("player_id", playerId)
      .maybeSingle(),
    // Window slice of player_external_load_daily for MPE recovery + EDI + ACWR.
    // Note: HMLD / HSR raw numbers are deliberately NOT exposed to the LLM
    // here — only derived rolling metrics (mpe_recovery z, edi avg, acwr-like)
    // are returned. This prevents the HMLD-as-HIR confusion that hit the Q&A
    // route on 2026-04-29. If you ever surface raw load numbers to the prompt,
    // mirror the metric_definitions block from ask/route.ts.
    supabase
      .from("player_external_load_daily")
      .select("date, mpe_recovery_avg_s, mpe_count_est, edi, total_player_load, total_distance, high_metabolic_load_distance_m")
      .eq("player_id", playerId)
      .gte("date", windowStart)
      .order("date", { ascending: false }),
    // Recent session context — was the last 3 days a match? Used so AI can
    // contextualise post-match load spikes as "expected, no concern".
    supabase
      .from("v_player_session_today_v2")
      .select("day_date, md_day_resolved, planned_focus, session_type")
      .eq("player_id", playerId)
      .gte("day_date", threeDaysAgoIso)
      .lte("day_date", todayIso)
      .order("day_date", { ascending: false }),
  ]);

  // Match-day awareness: detect if recent training was a match
  type SessionRow = {
    day_date: string;
    md_day_resolved?: string | null;
    planned_focus?: string | null;
    session_type?: string | null;
  };
  const recentSessRows: SessionRow[] = (recentSessions.data ?? []) as SessionRow[];
  let postMatchContext: { is_post_match: boolean; match_date: string | null; days_since_match: number | null; today_md_day: string | null } = {
    is_post_match: false,
    match_date: null,
    days_since_match: null,
    today_md_day: null,
  };
  for (const s of recentSessRows) {
    const md = String(s.md_day_resolved ?? "").toUpperCase();
    const focus = String(s.planned_focus ?? "").toUpperCase();
    const stype = String(s.session_type ?? "").toUpperCase();
    if (s.day_date === todayIso) {
      postMatchContext.today_md_day = md || null;
    }
    const isMatch = md === "MD" || focus.includes("MATCH") || focus.includes("GAME") || stype.includes("MATCH") || stype.includes("GAME");
    if (isMatch && !postMatchContext.match_date) {
      postMatchContext.match_date = s.day_date;
      const daysSince = Math.round((Date.parse(todayIso) - Date.parse(s.day_date)) / 86_400_000);
      postMatchContext.days_since_match = daysSince;
      postMatchContext.is_post_match = daysSince >= 0 && daysSince <= 2;
    }
  }
  // Also flag MD+1 / MD+2 explicitly as post-match
  if (postMatchContext.today_md_day === "MD+1" || postMatchContext.today_md_day === "MD+2") {
    postMatchContext.is_post_match = true;
  }

  // ── Compute MPE Recovery rolling z-score (Osgnach 2023) ──
  const mpeSeries = (extLoadWindow.data ?? [])
    .map((r: Record<string, unknown>) => Number(r.mpe_recovery_avg_s))
    .filter((v: number) => Number.isFinite(v) && v > 0);
  let mpeRecovery: { recent_avg_s: number | null; baseline_avg_s: number | null; z: number | null } | null = null;
  if (mpeSeries.length >= 4) {
    const baseAvg = mpeSeries.reduce((a, x) => a + x, 0) / mpeSeries.length;
    const variance = mpeSeries.reduce((a, x) => a + (x - baseAvg) ** 2, 0) / Math.max(mpeSeries.length - 1, 1);
    const baseSd = Math.sqrt(variance);
    const recentSlice = mpeSeries.slice(0, Math.min(7, mpeSeries.length));
    const recAvg = recentSlice.reduce((a, x) => a + x, 0) / recentSlice.length;
    mpeRecovery = {
      recent_avg_s: Math.round(recAvg),
      baseline_avg_s: Math.round(baseAvg),
      z: baseSd > 0 ? Number(((recAvg - baseAvg) / baseSd).toFixed(2)) : null,
    };
  }

  // ── EDI summary across window ──
  const ediValues = (extLoadWindow.data ?? [])
    .map((r: Record<string, unknown>) => Number(r.edi))
    .filter((v: number) => Number.isFinite(v) && v > 1.0);
  const ediAvg = ediValues.length > 0
    ? Number((ediValues.reduce((a, x) => a + x, 0) / ediValues.length).toFixed(2))
    : null;

  // ── ACWR proxy from PL: 7d sum / (28d weekly avg) — but we only have window
  // here, so use a simple recent-vs-window load comparison ──
  const plSeries = (extLoadWindow.data ?? [])
    .map((r: Record<string, unknown>) => Number(r.total_player_load))
    .filter((v: number) => Number.isFinite(v) && v > 0);
  const plRecentSum = plSeries.slice(0, 7).reduce((a, x) => a + x, 0);
  const plWindowSum = plSeries.reduce((a, x) => a + x, 0);
  const acwrLike = plWindowSum > 0 && plSeries.length >= 7
    ? Number((plRecentSum / (plWindowSum / Math.max(plSeries.length / 7, 1))).toFixed(2))
    : null;

  return {
    player_name:    (playerInfo.data?.full_name as string | null) ?? "Player",
    position:       (playerInfo.data?.position as string | null) ?? null,
    window_days:    windowDays,
    // Ground-truth verdict the coach is currently looking at on screen.
    coach_visible_verdict: coachVerdict ?? null,
    pattern:                pattern.data ?? null,
    decel_sub_engine:       mcburnie.data ?? null,
    indoor_state:           indoorStatus.data ?? null,
    active_injuries: (injuries.data ?? []).map((i: Record<string, unknown>) => ({
      type:      i.injury_type,
      side:      i.body_side,
      severity:  i.severity,
      injury_date: i.injury_date,
      expected_return: i.return_date,
    })),
    // Newer metrics (Sharp Cut, MPE, ASP, EDI, ACWR-like) — all optional
    // so existing prompts work even when these are null.
    sharp_cut:        sharpCut.data ?? null,
    asp_burst:        aspBurst.data ?? null,
    mpe_recovery:     mpeRecovery,
    edi_window_avg:   ediAvg,
    acwr_like:        acwrLike,
    sessions_in_window: (extLoadWindow.data ?? []).length,
    // Match-day awareness — if today is post-match, load spikes are expected
    // and should be framed as such, not as concerning overreach.
    match_context:    postMatchContext,
  };
}

function hashSignals(input: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
}

// ─── Claude call ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an assistant for football head coaches and S&C staff.

Your job is to read structured player data and produce a short ENGLISH summary
describing the player's state and what the coach should worry about.

ENGLISH ONLY. Do NOT output Icelandic.

═══════ HARD RULES — VIOLATING ANY OF THESE WILL CAUSE REJECTION ═══════

LENGTH:
- Each summary: exactly 3-4 sentences. NEVER more.

LANGUAGE:
- Plain coach language. NO data jargon. NEVER use internal metric names:
  "ACWR", "McBurnie", "HMLD", "z-score", "deceleration-to-acceleration ratio".
  Translate to coach speak: "training load is climbing", "lots of high-intensity
  braking", "needs more sprint exposure".

NUMBERS — STRICT:
- ONLY cite numbers that appear LITERALLY in the input JSON.
- If pattern.persistent_self_reports.poor_sleep_days = 5 and the window is 7,
  you may say "poor sleep on 5 of 7 days". You may NOT say "8 of 7 days",
  "8 days", or any number larger than the window itself.
- "X of Y days" — X must be ≤ Y. Always.
- NEVER invent specific ratios like "0.55 vs 0.8-1.2". If the input doesn't
  contain a literal ratio, do not write one.
- NEVER claim a test was "missed" unless input says so. If active_injuries is
  empty, do not say the player has an injury or missed a strength test.
- When in doubt about a specific number, omit it and use qualitative language
  ("most of the week", "several days", "a few sessions").

ALIGNMENT WITH WHAT THE COACH SEES — CRITICAL:
═══════ INJURY OVERRIDE — HIGHEST PRIORITY ═══════
- If active_injuries is NOT empty, the player is NOT cleared to train. The
  on-screen verdict will be "Out — injury", "Limited — rehab", or similar.
  Your summary MUST honor that.
- Required behavior when active_injuries has any entry:
    * Sentence 1 MUST start with the injury status, e.g.:
        - "Out — recovering from <body_part> injury (since <injury_date>, expected back <expected_return>)."
        - "Limited — rehab from <body_part>; not cleared for full training yet."
      Use the body_part / injury_date / expected_return fields from the
      active_injuries entry literally — do not paraphrase the dates.
    * NEVER write "cleared for full session", "ready to train", "no action
      needed today", "follow today's plan", "go at full intensity", or any
      phrase that implies the player is available. Those words contradict
      the on-screen Out/Rehab badge and destroy coach trust.
    * If load/wellness data exists, frame it as RECOVERY context
      ("recovery looks on track", "wellness has held up well during rehab")
      not as TRAINING readiness. Load numbers from before the injury are
      historical only.
    * Action sentence should focus on rehab progression, not training:
      "continue rehab plan", "monitor for clearance before next match",
      "recheck pain on the affected area".
- The injury override beats every other rule below — coach_visible_verdict,
  match-day context, load spikes, ASL z-scores. If active_injuries is
  populated, READ THE INJURY FIRST.

═══════ COACH-VISIBLE VERDICT ALIGNMENT (when not injured) ═══════
- The input includes coach_visible_verdict which is the EXACT verdict + headline +
  reasoning that is rendered on the coach's screen RIGHT NOW. Your summary appears
  ON THE SAME SCREEN as that verdict.
- If coach_visible_verdict.state is "Ready"/"Full"/"GREEN" and your summary says
  the opposite (e.g. "flagged RED", "needs rest"), the screen will contradict
  itself. THIS DESTROYS COACH TRUST. Never do it.
- Required behavior:
    * coach_visible_verdict.state = "Ready" / "Full" / GREEN
        → Sentence 1 MUST start with "Ready" or equivalent.
        → You may add nuance ("ready today, but watch the trend") but NEVER override.
        → Action: "no action needed today" OR "monitor trend"
        → NEVER say "flagged RED", "back off", "rest immediately".
    * coach_visible_verdict.state = "Modified" / YELLOW
        → Sentence 1: lead with "modified" or "watch this player".
        → Action: a specific modification (drop X, swap Y).
    * coach_visible_verdict.state = "Recovery" / "Rest" / RED
        → Sentence 1: reinforce the rest/recovery decision.
        → Action: explain what recovery looks like.
- The decel_sub_engine field is just one of many inputs to the visible verdict.
  Even if decel_sub_engine.overall_flag is "red", DO NOT override coach_visible_verdict.
  The aggregate verdict has already weighed all inputs. You add pattern context only.
- If coach_visible_verdict is null, fall back to using pattern + current_state for
  the headline, but be conservative.

STRUCTURE:
- Sentence 1: headline matching coach_visible_verdict.state.
- Sentence 2: pattern over the window (use literal numbers from input).
- Sentence 3-4: action — concrete and proportionate. If everything looks fine,
  say "no action needed".

EXTRA SIGNALS YOU MAY USE WHEN PRESENT (lower priority than coach_visible_verdict):
- sharp_cut.cuts_personal_z > 1.0 → "sharp braking work above his usual" (in coach speak)
- asp_burst.ad_couple_personal_z > 0.7 → "more braking than acceleration than usual"
- mpe_recovery.z > 1.0 → "recovery time between high-intensity bursts is lengthening"
  (this is an early fatigue signal — worth mentioning even if other signals are green)
- edi_window_avg > 1.30 → "intensity per metre is high" (unusually dense workload)
- acwr_like > 1.5 → "training load has spiked vs the usual baseline"
- pattern.persistent_self_reports.poor_sleep_days >= 4 → "poor sleep most of the week"
- pattern.persistent_self_reports.sore_days >= 4 → "sore most of the week"

MATCH-DAY CONTEXT — CRITICAL:
- The input includes match_context. If match_context.is_post_match = true OR
  match_context.today_md_day = "MD+1" / "MD+2", today's load spikes are EXPECTED
  (it's the post-match echo, not unplanned overreach).
- In that case:
    * NEVER frame load spikes as "concerning" or "overreach" — the player just
      played a match. The body is supposed to feel it.
    * Frame as "post-match — expected" or "normal post-match echo".
    * Action should be "standard post-match recovery" or "no action needed —
      monitor as usual", NOT "back off" or "consider rest".
- If days_since_match = 0 (match was today), focus on recovery messaging.
- If days_since_match = 1 (yesterday), that's MD+1 — typically recovery day,
  load spike from yesterday is fully expected.
- If days_since_match = 2 (MD+2), load echo still partly normal but starting
  to fade — slight concern only if other signals also fire (sleep + soreness).

When several extra signals fire together, mention 1-2 in sentence 2 — the most
salient ones — not all. Quality > comprehensiveness.

NEVER invent signals not in the input. Better to say "limited data" than guess.
NEVER pretend the player is injured if active_injuries is empty.
NEVER cite a number unless it appears literally in the input JSON.

Output JSON only, no surrounding text:
{ "summary": "English 3-4 sentence summary" }`;

async function callClaude(input: unknown): Promise<{ summary: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const userMessage = `Player data:\n\n${JSON.stringify(input, null, 2)}\n\nWrite the English summary now. JSON only.`;

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
      system:      SYSTEM_PROMPT,
      messages:    [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Claude API ${res.status}: ${txt.slice(0, 200)}`);
  }

  const json = await res.json() as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  if (!text) throw new Error("Claude returned no text content");

  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let parsed: { summary?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
  if (!parsed.summary) {
    throw new Error(`Claude response missing 'summary' field: ${cleaned.slice(0, 200)}`);
  }
  return { summary: parsed.summary.trim() };
}

// ─── Validation: reject hallucinations ──────────────────────────────────────
const FORBIDDEN_TERMS = [
  /\bACWR\b/i,
  /\bHMLD\b/i,
  /\bMcBurnie\b/i,
  /\bz[\s-]?score\b/i,
  /\bd:sprint\b/i,
  /\ba:d\s+coupling\b/i,
  /deceleration[-\s]to[-\s]acceleration\s+ratio/i,
  /\b(?:0\.\d+|1\.\d+)\s*(?:vs|versus)\s*(?:0\.\d+|1\.\d+)/i, // bans "0.55 vs 0.8-1.2"
];

// Words that imply rest / negative verdict — used when coach_verdict says GREEN
const REST_WORDS = [
  /\brest\b/i, /\bhvíld/i, /\bhvíla\b/i,
  /\bback\s+off\b/i, /\bbacking\s+off\b/i,
  /\bflagged\s+red\b/i, /\bmarkað\s+rautt/i,
  /\bsit\s+out\b/i, /\bsit\s+him\s+out\b/i,
];

// Words that imply Ready/full training — used when coach_verdict says RED
const FULL_TRAINING_WORDS = [
  /\bfull\s+training\b/i, /\bfullri?\s+æfingu\b/i,
  /\bno\s+restrictions\b/i, /\bengar?\s+takmarkanir\b/i,
];

function isGreenVerdict(state: string | undefined): boolean {
  if (!state) return false;
  const s = state.toLowerCase();
  return s.includes("ready") || s.includes("full") || s.includes("green") || s.includes("tilbú");
}
function isRedVerdict(state: string | undefined): boolean {
  if (!state) return false;
  const s = state.toLowerCase();
  return s.includes("rest") || s.includes("recovery") || s.includes("red")
      || s.includes("hvíld") || s.includes("rautt");
}

// Phrases that imply the player is cleared to train. Forbidden when the
// player has an active injury — would contradict the on-screen Out/Rehab
// badge and erode coach trust. Ívar 2026-04-30 incident: AI said "cleared
// for full session today" while the verdict above was "Out — injury".
const CLEARANCE_PHRASES = [
  /\bcleared\s+(?:for|to)\s+(?:full|train|session|play)/i,
  /\bready\s+to\s+(?:train|play|go)/i,
  /\bgo\s+at\s+full\s+intensity\b/i,
  /\bfollow\s+today'?s?\s+(?:training\s+)?plan\b/i,
  /\bno\s+action\s+needed\b/i,
  /\bavailable\s+for\s+(?:full\s+)?(?:session|training|match)/i,
  /\bgood\s+readiness\s+today\b/i,
  /\bfull\s+session\s+today\b/i,
];

function validateSummary(
  text: string,
  windowDays: 7 | 14,
  coachVerdict: CoachVerdictInput,
  hasActiveInjury: boolean = false,
): string | null {
  for (const re of FORBIDDEN_TERMS) {
    if (re.test(text)) return `Contains forbidden jargon/ratio: ${re.source}`;
  }
  // Injury override — clearance phrases are forbidden when active_injuries
  // is non-empty. Catches the failure mode where AI grabs load/wellness
  // signals and writes "ready to train" while the screen says Out.
  if (hasActiveInjury) {
    for (const re of CLEARANCE_PHRASES) {
      if (re.test(text)) {
        return `Contradicts active injury: contains "${re.source}" while player has an active injury`;
      }
    }
  }
  // Sentence-count guardrail
  const sentenceCount = text.split(/[.!?]+/).filter((s) => s.trim().length > 5).length;
  if (sentenceCount < 2 || sentenceCount > 6) {
    return `Sentence count out of bounds (${sentenceCount}, expected 3-4)`;
  }
  // "X of Y days" hallucination guard — reject if X > Y or Y conflicts with window
  const xOfYRegex = /(\d+)\s+(?:of|af)\s+(?:the\s+)?(?:last\s+|síðustu\s+)?(\d+)\s+days?/gi;
  let m: RegExpExecArray | null;
  while ((m = xOfYRegex.exec(text)) !== null) {
    const x = parseInt(m[1], 10);
    const y = parseInt(m[2], 10);
    if (x > y) return `Impossible day count: "${x} of ${y} days"`;
    if (y > windowDays + 1) return `Day count window mismatch: "${y} days" exceeds the ${windowDays}-day window`;
  }
  // Bare "N days" — reject if N exceeds window (catches "8 days" with no "of" qualifier)
  const bareDaysRegex = /(\d+)\s+(?:days?|dögum?|dagar?|daga\b)/gi;
  while ((m = bareDaysRegex.exec(text)) !== null) {
    const n = parseInt(m[1], 10);
    // Allow small numbers (≤5) freely as they're plausibly within any window;
    // only flag numbers that clearly exceed the window
    if (n > windowDays && n > 5) {
      return `Impossible day count: "${n} days" exceeds the ${windowDays}-day window`;
    }
  }
  // Verdict-alignment check — must not contradict what coach sees on screen
  if (coachVerdict?.state) {
    if (isGreenVerdict(coachVerdict.state)) {
      for (const re of REST_WORDS) {
        if (re.test(text)) {
          return `Contradicts coach-visible verdict (${coachVerdict.state}): contains "${re.source}"`;
        }
      }
    }
    if (isRedVerdict(coachVerdict.state)) {
      for (const re of FULL_TRAINING_WORDS) {
        if (re.test(text)) {
          return `Contradicts coach-visible verdict (${coachVerdict.state}): contains "${re.source}"`;
        }
      }
    }
  }
  return null;
}

// ─── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  if (!playerId) return NextResponse.json({ error: "Missing player id" }, { status: 400 });

  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const windowDays = (Number(req.nextUrl.searchParams.get("window") ?? "7") === 14 ? 14 : 7) as 7 | 14;
  const supabase   = getSupabase();

  // Verify player belongs to coach's team
  const { data: playerCheck } = await supabase
    .from("players")
    .select("id, team_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!playerCheck || playerCheck.team_id !== auth.teamId) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  // Try cache (today only) — if hit, return immediately
  const today = new Date().toISOString().slice(0, 10);
  const { data: cached } = await supabase
    .from("player_daily_summary")
    .select("summary_is, summary_en, generated_at, signal_hash")
    .eq("player_id", playerId)
    .eq("window_days", windowDays)
    .eq("date_generated", today)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({
      ok: true,
      cached: true,
      summary: cached.summary_en,  // schema kept summary_en column for the English text
      generated_at: cached.generated_at,
    });
  }

  // No cache — generate (no coach_verdict on GET)
  return generateAndStore(supabase, playerId, auth.teamId, windowDays, null);
}

// ─── POST — force regeneration ──────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  if (!playerId) return NextResponse.json({ error: "Missing player id" }, { status: 400 });

  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as {
    window?: number;
    coach_verdict?: CoachVerdictInput;
  };
  const windowDays = (Number(body.window ?? 7) === 14 ? 14 : 7) as 7 | 14;
  const coachVerdict = body.coach_verdict ?? null;
  const supabase   = getSupabase();

  const { data: playerCheck } = await supabase
    .from("players")
    .select("id, team_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!playerCheck || playerCheck.team_id !== auth.teamId) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  return generateAndStore(supabase, playerId, auth.teamId, windowDays, coachVerdict);
}

async function generateAndStore(
  supabase: ReturnType<typeof getSupabase>,
  playerId: string,
  teamId:   string,
  windowDays: 7 | 14,
  coachVerdict: CoachVerdictInput,
) {
  let input: unknown;
  let summary: { summary: string };
  let issues: string | null = null;

  // Try up to 2 attempts — LLM hallucinations are random; a second try usually
  // produces clean output. We don't want to surface a 422 to the coach unless
  // both attempts fail, since that breaks the silent-fallback UX.
  try {
    input = await buildSummaryInput(supabase, playerId, windowDays, coachVerdict);
    // Detect active injury from input bundle so the validator can enforce
    // the injury-override rules (block "cleared for full session" etc.).
    const hasActiveInjury = Array.isArray((input as { active_injuries?: unknown[] }).active_injuries)
      && ((input as { active_injuries: unknown[] }).active_injuries.length > 0);
    summary = await callClaude(input);
    issues = validateSummary(summary.summary, windowDays, coachVerdict, hasActiveInjury);
    if (issues) {
      console.warn("[player-summary] First attempt failed validation, retrying", { issues });
      summary = await callClaude(input);
      issues = validateSummary(summary.summary, windowDays, coachVerdict, hasActiveInjury);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Generation failed: ${msg}` }, { status: 500 });
  }

  if (issues) {
    return NextResponse.json({
      error: `Validation failed after retry: ${issues}`,
      summary: summary.summary,
    }, { status: 422 });
  }

  // Upsert cache. Schema kept the summary_is column (legacy) — we now store
  // the same English text in both columns so existing readers don't break.
  const today = new Date().toISOString().slice(0, 10);
  const inputHash = hashSignals(input);
  const { error: upsertErr } = await supabase
    .from("player_daily_summary")
    .upsert({
      player_id:      playerId,
      team_id:        teamId,
      date_generated: today,
      window_days:    windowDays,
      summary_is:     summary.summary,  // duplicated for legacy schema
      summary_en:     summary.summary,
      signal_hash:    inputHash,
      model_version:  CLAUDE_MODEL,
      generated_at:   new Date().toISOString(),
    } as never, { onConflict: "player_id,date_generated,window_days" });

  if (upsertErr) {
    console.error("[player-summary] upsert error", upsertErr);
    // Return summary anyway — cache miss is non-fatal
  }

  return NextResponse.json({
    ok: true,
    cached: false,
    summary: summary.summary,
    generated_at: new Date().toISOString(),
  });
}

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

  // For minutes_capacity we need a wider lookback (90 days) to compute a stable
  // "typical match PL". For other questions, the original 7-day window is fine.
  const wantsMinuteCapacity = dataKeys.includes("recent_load") && dataKeys.includes("match_calendar");
  let matchDatesAll: string[] = [];

  if (dataKeys.includes("match_calendar")) {
    // Pull recent + upcoming sessions to identify last/next match.
    // Widened lookback to 90 days when minutes_capacity context is needed so
    // we can build a stable typical-match-PL average.
    const lookbackIso = wantsMinuteCapacity
      ? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
      : sevenAgoIso;
    const { data } = await supabase
      .from("v_player_session_today_v2")
      .select("day_date, md_day_resolved, planned_focus, session_type")
      .eq("player_id", playerId)
      .gte("day_date", lookbackIso)
      .order("day_date", { ascending: false }).limit(120);
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
      if (isMatch && s.day_date <= todayIso) {
        if (!lastMatch) lastMatch = s;
        matchDatesAll.push(s.day_date);
      }
      if (s.day_date === todayIso) nextMatchMdDay = md || null;
    }
    out.match_calendar = { last_match: lastMatch, today_md_day: nextMatchMdDay };
  }

  if (dataKeys.includes("recent_load")) {
    // For minutes_capacity we need 90d of load to compute a typical match PL
    // (a 14d window often has 1-2 matches, too few for a stable mean). Other
    // questions only need the 14d slice — fetch wider only when needed.
    const loadStartIso = wantsMinuteCapacity
      ? new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
      : fourteenAgoIso;
    const { data } = await supabase
      .from("player_external_load_daily")
      .select("date, total_distance, total_player_load, high_speed_distance, sprint_distance, velocity_band5_total_distance, velocity_band6_total_distance, high_metabolic_load_distance_m, ima_band3_decel_count, sharp_cut_count_est, mpe_count_est, mpe_recovery_avg_s, edi, activity_class_brown")
      .eq("player_id", playerId)
      .gte("date", loadStartIso)
      .order("date", { ascending: false });
    // Semantic labels — prevents Claude from confusing HMLD (metabolic-power
    // based) with HSR/HIR (velocity based). They are NOT the same. Ívar
    // hallucination 2026-04-29: AI reported HMLD 4057m as "high-intensity
    // running" when actual HIR was V5+V6 = 308+38 = 346m. Field labels and
    // explicit metric_definitions block now make this distinction explicit.
    type LoadRow = {
      date: string;
      total_distance: number | null;
      total_player_load: number | null;
      high_speed_distance: number | null;
      sprint_distance: number | null;
      velocity_band5_total_distance: number | null;
      velocity_band6_total_distance: number | null;
      high_metabolic_load_distance_m: number | null;
      ima_band3_decel_count: number | null;
      sharp_cut_count_est: number | null;
      mpe_count_est: number | null;
      mpe_recovery_avg_s: number | null;
      edi: number | null;
      activity_class_brown: string | null;
    };
    const rows = (data ?? []) as LoadRow[];
    // Only send the last 14 days into the prompt — keeps the payload tight.
    // The 90d slice (when fetched) is used only for the capacity computation
    // below, not exposed to the LLM.
    out.recent_load_14d = rows
      .filter((r) => r.date >= fourteenAgoIso)
      .map((r) => ({
        date: r.date,
        total_distance_m:                r.total_distance,
        total_player_load_au:            r.total_player_load,
        hsr_meters_v5_plus:              r.high_speed_distance,        // velocity > 5.5 m/s
        sprint_meters_v6_plus:           r.sprint_distance,            // velocity > 7.0 m/s
        v5_distance_m:                   r.velocity_band5_total_distance,
        v6_distance_m:                   r.velocity_band6_total_distance,
        high_metabolic_load_distance_m:  r.high_metabolic_load_distance_m, // power-based, NOT HIR
        decel_band3_count:               r.ima_band3_decel_count,
        sharp_cut_count_est:             r.sharp_cut_count_est,
        mpe_count_est:                   r.mpe_count_est,
        mpe_recovery_avg_s:              r.mpe_recovery_avg_s,
        edi:                             r.edi,
        activity_class:                  r.activity_class_brown,
      }));

    // ── Pre-compute minute-capacity context when needed ───────────────────
    // We do the arithmetic here (not in the LLM) because Claude Haiku makes
    // sum/mean errors more often than we'd like. Send pre-rounded numbers
    // and let the LLM apply the threshold rules + days-since-injury cap.
    if (wantsMinuteCapacity) {
      const sevenAgoDate = sevenAgoIso;
      const thirtyAgoIso = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

      // Typical match PL — average total_player_load across match days. Use
      // the 30-day window first (recent form), fall back to 90d if too few.
      const matchPlsRecent: number[] = [];
      const matchPlsAll90: number[] = [];
      for (const r of rows) {
        const pl = Number(r.total_player_load);
        if (!Number.isFinite(pl) || pl <= 0) continue;
        if (matchDatesAll.includes(r.date)) {
          matchPlsAll90.push(pl);
          if (r.date >= thirtyAgoIso) matchPlsRecent.push(pl);
        }
      }
      const useMatchPls = matchPlsRecent.length >= 2 ? matchPlsRecent : matchPlsAll90;
      const typicalMatchPl = useMatchPls.length > 0
        ? Math.round(useMatchPls.reduce((a, x) => a + x, 0) / useMatchPls.length)
        : null;

      // 7-day cumulative + max single session
      let sum7d = 0;
      let max7d = 0;
      let sessions7d = 0;
      for (const r of rows) {
        const pl = Number(r.total_player_load);
        if (!Number.isFinite(pl) || pl <= 0) continue;
        if (r.date >= sevenAgoDate) {
          sum7d += pl;
          if (pl > max7d) max7d = pl;
          sessions7d += 1;
        }
      }

      // Days since last match (using the wider match list we collected)
      const lastMatchDate = matchDatesAll.length > 0 ? matchDatesAll[0] : null;
      const daysSinceLastMatch = lastMatchDate
        ? Math.round((Date.parse(todayIso) - Date.parse(lastMatchDate)) / 86_400_000)
        : null;

      // Days since injury return — only if we already fetched active injuries
      // AND the most recent one has an expected_return in the past
      let daysSinceInjuryReturn: number | null = null;
      const injuries = (out.active_injuries as Array<{ expected_return?: string | null }> | undefined) ?? [];
      for (const inj of injuries) {
        if (inj.expected_return && inj.expected_return <= todayIso) {
          const days = Math.round((Date.parse(todayIso) - Date.parse(inj.expected_return)) / 86_400_000);
          if (daysSinceInjuryReturn === null || days < daysSinceInjuryReturn) {
            daysSinceInjuryReturn = days;
          }
        }
      }

      out.minute_capacity_context = {
        typical_match_player_load:    typicalMatchPl,
        match_days_used_for_avg:      useMatchPls.length,
        match_avg_window:             matchPlsRecent.length >= 2 ? "30d" : "90d",
        cumulative_7d_player_load:    Math.round(sum7d),
        sessions_in_7d:               sessions7d,
        max_session_pl_7d:            Math.round(max7d),
        load_ratio_7d_vs_match:       typicalMatchPl && typicalMatchPl > 0
          ? Number((sum7d / typicalMatchPl).toFixed(2))
          : null,
        days_since_last_match:        daysSinceLastMatch,
        days_since_injury_return:     daysSinceInjuryReturn,
        scale_note:                   "Player Load is in arbitrary units. Use load_ratio_7d_vs_match (cumulative_7d / typical_match) as the primary capacity signal.",
      };
    }

    out.metric_definitions = {
      hsr_meters_v5_plus:              "High-speed running distance (velocity > 5.5 m/s). This IS 'high-intensity running' (HIR) for coach communication.",
      sprint_meters_v6_plus:           "Sprint distance (velocity > 7.0 m/s). Subset of HSR.",
      high_metabolic_load_distance_m:  "Distance covered at high metabolic power (>25.5 W/kg). Different metric — DO NOT call this 'high-intensity running' or 'HIR'. If you must reference it, say 'high-effort distance' or 'metabolically demanding distance'. Typically 5-10x larger than HSR — confusing the two will produce massively wrong numbers.",
      total_distance_m:                "Total distance covered. This is everything, walking included.",
      total_player_load_au:            "Catapult Player Load (arbitrary units, accelerometer-derived).",
    };
  }

  if (dataKeys.includes("wellness_recent")) {
    // Read the NEW 6-step columns — these are what the player actually fills
    // in and what the coach sees in the UI. The legacy columns (sleep,
    // soreness, readiness) are derived/scaled differently (e.g. legacy
    // 'soreness' is 1-5 with 5=very sore; new muscle_soreness is 1-5 with
    // 5=no pain — inverted). Reading the legacy columns made the AI describe
    // numbers that didn't match what the coach saw on screen.
    const { data } = await supabase
      .from("readiness_entries")
      .select("entry_date, fatigue_energy, sleep_quality, sleep_duration, stress_mood, muscle_soreness, total_score, md_day")
      .eq("player_id", playerId)
      .gte("entry_date", sevenAgoIso)
      .order("entry_date", { ascending: false });
    type WellnessRow = {
      entry_date: string;
      fatigue_energy: number | null;
      sleep_quality: number | null;
      sleep_duration: number | null;
      stress_mood: number | null;
      muscle_soreness: number | null;
      total_score: number | null;
      md_day: string | null;
    };
    out.wellness_recent = ((data ?? []) as WellnessRow[]).map((r) => ({
      date:                    r.entry_date,
      md_day:                  r.md_day,
      fatigue_energy_1to5:     r.fatigue_energy,
      sleep_quality_1to5:      r.sleep_quality,
      sleep_duration_1to5:     r.sleep_duration,
      stress_mood_1to5:        r.stress_mood,
      muscle_soreness_1to5:    r.muscle_soreness,
      total_score_max25:       r.total_score,
    }));
    out.wellness_scale_definitions = {
      _common:                 "All 5 sub-scores are on a 1-5 scale where 5=BEST and 1=WORST. total_score = sum of the 5 sub-scores (range 5-25, 25=best).",
      fatigue_energy_1to5:     "Player's energy / freshness. 5=fully energised, 1=exhausted.",
      sleep_quality_1to5:      "How well he slept. 5=excellent, 1=very poor.",
      sleep_duration_1to5:     "How long he slept. 5=plenty, 1=very short.",
      stress_mood_1to5:        "Mental state. 5=relaxed/positive, 1=stressed/low.",
      muscle_soreness_1to5:    "Muscle soreness. 5=NO pain, 1=very sore. NOTE: high = good, low = bad. Do NOT say 'soreness rose to 4' as if 4 was bad — 4/5 means he is barely sore.",
      total_score_max25:       "Sum of all 5 sub-scores. 20+ = good day, 10-15 = rough day, <10 = very poor.",
    };
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
- Cite numbers ONLY if they appear LITERALLY in the input JSON. Never average,
  round dramatically, or compute new totals — read the value as-is.
- If you reference "high-intensity running" or "HIR" or "high-speed running"
  or "sprints", you MUST use the value from the field 'hsr_meters_v5_plus'
  (or 'sprint_meters_v6_plus' for sprints specifically). NEVER use
  'high_metabolic_load_distance_m' for these — that is a power-based metric,
  typically 5-10x larger, and calling it HIR is a serious error that will
  destroy coach trust.
- If you reference total distance, use 'total_distance_m'. If you reference
  Player Load, use 'total_player_load_au'.
- A 'metric_definitions' block in the input tells you what each field means.
  Trust those definitions over your prior assumptions about column names.
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
function validateAnswer(text: string, scopedData?: Record<string, unknown>): string | null {
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
  // HIR-vs-HMLD substitution guard. Catches: AI cites a number alongside
  // "high-intensity running" / "high speed running" / "sprint distance"
  // that doesn't match any real HSR/sprint value in the input — typically
  // because the AI grabbed HMLD (which is 5-10x larger) instead.
  // Triggered the Ívar 2026-04-29 incident: "4057 meters of high-intensity
  // running" when actual HSR was 346m (HMLD was 4057m).
  if (scopedData) {
    const loadRows = (scopedData.recent_load_14d as Array<Record<string, number | null>> | undefined) ?? [];
    const validHirNumbers = new Set<number>();
    for (const r of loadRows) {
      for (const k of ["hsr_meters_v5_plus", "sprint_meters_v6_plus", "v5_distance_m", "v6_distance_m"]) {
        const v = r?.[k];
        if (typeof v === "number" && v > 0) {
          // Allow a small rounding tolerance — AI may say "350m" for 345.46
          validHirNumbers.add(Math.round(v));
        }
      }
    }
    const hirContextRegex = /(\d{2,5}(?:\.\d+)?)\s*(?:m|meters?|metres?)?\s*(?:of\s+)?(?:high[-\s]intensity\s+running|high[-\s]speed\s+running|HIR|HSR|sprint(?:ing|\s+distance)?)/gi;
    let h: RegExpExecArray | null;
    while ((h = hirContextRegex.exec(text)) !== null) {
      const cited = parseFloat(h[1]);
      if (!Number.isFinite(cited)) continue;
      // Allow values that are within 10% of any real HSR/sprint number
      const matched = Array.from(validHirNumbers).some(
        (v) => Math.abs(cited - v) <= Math.max(15, v * 0.1),
      );
      if (!matched) {
        // Check if the cited value matches HMLD instead — the most common
        // confusion. If so, name the bug clearly in the error so the retry
        // prompt is informative.
        const hmldNumbers = loadRows
          .map((r) => r?.high_metabolic_load_distance_m)
          .filter((v): v is number => typeof v === "number" && v > 0)
          .map((v) => Math.round(v));
        const isHmld = hmldNumbers.some((v) => Math.abs(cited - v) <= Math.max(50, v * 0.1));
        return isHmld
          ? `HIR/HSR cited as ${cited}m matches HMLD, not actual HSR. HMLD is power-based, not HIR.`
          : `HIR/HSR cited as ${cited}m doesn't match any real HSR/sprint value in input.`;
      }
    }
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

  // ELITE-tier gate. AI Q&A is a premium feature.
  const isElite = await isEliteTeam(supabase, auth.teamId);
  if (!isElite) {
    return NextResponse.json(ELITE_REQUIRED_RESPONSE.body, { status: ELITE_REQUIRED_RESPONSE.status });
  }

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
    issues = validateAnswer(answer.answer, scopedData);
    if (issues) {
      console.warn("[player-ask] First attempt failed validation, retrying", { questionId, issues });
      // On HIR-vs-HMLD failure, append a corrective hint to the prompt so
      // the retry has a fighting chance. Generic retry doesn't change the
      // model's reasoning enough to fix metric confusion.
      const retryHint = issues.includes("HMLD")
        ? `\n\nIMPORTANT: Your previous attempt confused 'high_metabolic_load_distance_m' (HMLD, power-based, ~4000m typical) with HIR/HSR. HIR is in 'hsr_meters_v5_plus' (typically 100-500m). Re-read the metric_definitions block. NEVER call HMLD high-intensity running.`
        : `\n\nYour previous answer failed validation: ${issues}. Be more careful with field names and numbers.`;
      answer = await callClaude(systemPrompt, userMessage + retryHint);
      issues = validateAnswer(answer.answer, scopedData);
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

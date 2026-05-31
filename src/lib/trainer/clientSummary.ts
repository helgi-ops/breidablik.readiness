/**
 * src/lib/trainer/clientSummary.ts
 *
 * Generates a PT-shaped AI summary for one client. Different shape from the
 * team-side player summary (src/app/api/coach/player/[id]/summary/route.ts):
 *   - No GPS / Catapult / IMA / decel signals (PT clients don't have pods)
 *   - Adherence-focused: wellness check-ins + plan completion + sore-area
 *     patterns + active injuries + active programmes
 *   - Two outputs per call:
 *       digest  — single short line for the dashboard list (≤14 words)
 *       summary — 3-5 sentence prose for the client detail surface
 *   - Empty-state guard returns null when < MIN_READINESS check-ins are
 *     present in the window (prevents Haiku from confabulating from nothing).
 *
 * Caller is responsible for caching the result into pt_client_summary_cache.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeFosterMonotonyStrain,
  computeHeavyLiftingExposure,
} from "@/lib/trainer/loadIntelligence";
import { e1rmFromSet } from "@/lib/client/oneRepMaxFormulas";

export type SummaryLang = "IS" | "EN";
export type SummaryWindow = 7 | 14 | 30;

export const MIN_READINESS_FOR_SUMMARY = 3;
export const PT_SUMMARY_MODEL  = "claude-haiku-4-5-20251001";
export const PT_SUMMARY_MAX_TOKENS = 350;

export type ReadinessRow = {
  entry_date: string;
  total_score: number | null;
  fatigue_energy: number | null;
  sleep_quality: number | null;
  sleep_duration: number | null;
  stress_mood: number | null;
  muscle_soreness: number | null;
  sore_areas: unknown;
  notes: string | null;
  color: string | null;
};

export type ClientSummaryInput = {
  clientName: string;
  windowDays: SummaryWindow;
  readiness: ReadinessRow[];
  /** Distinct days that had any prescribed workout */
  scheduledDays: number;
  /** Days the client logged a completed workout in the window */
  completedDays: number;
  /** Top 3 sore-area tags by count over the window */
  soreAreaCounts: Array<{ area: string; count: number }>;
  /** Active injuries (RTP / illness) summarised */
  activeInjuries: Array<{ type: string; body_area: string | null; status: string | null }>;
  /** Active 12-week Explosive Power programme, if any */
  explosivePower: { level: string; current_phase: number; weeks_label: string | null } | null;
  /** Most recent LV Profile test summary (if any) */
  lvProfile: { exercise: string; predicted_1rm_kg: number | null; profile: string | null; tested_at: string } | null;
  /** Recent PT chat thread metrics — count only, never content */
  chatMessageCount: number;
  /** Session-level RPE (Foster sRPE) over the window — Borg CR-10 scale */
  sessionRpe: {
    sessions_logged: number;
    avg_rpe: number | null;
    avg_duration_min: number | null;
    avg_session_load: number | null;
    trend_rpe: "up" | "down" | "flat" | null;
  };
  /** Per-exercise weight progression: top exercises by session count,
   *  earliest-vs-latest top-set comparison. Up to 4 exercises. */
  progression: Array<{
    exercise_name: string;
    sessions: number;
    first_top_set: { weight_kg: number; reps: number } | null;
    last_top_set: { weight_kg: number; reps: number } | null;
    pct_change_e1rm: number | null;  // Epley 1RM estimate change %
  }>;
  /** Foster monotony × strain over the last 7 days (overload risk detector) */
  foster: {
    monotony: number | null;
    strain: number;
    status: "ok" | "watch" | "deload_recommended" | "deload_required";
    reason: string;
  };
  /** Pareja-Blanco heavy-lifting exposure over the last 7 days */
  exposure: {
    heavy_sets: number; cap: number; saturation: number;
    status: "low" | "optimal" | "high" | "excessive";
    reason: string;
  };
};

export type ClientSummaryOutput = {
  digest: string;
  summary: string;
};

/* ── Data fetch ─────────────────────────────────────────────────────────── */

/**
 * Pull all inputs for one client over the rolling window. Service-role
 * supabase client — callers are responsible for authorising trainer access
 * before calling this.
 */
export async function buildClientSummaryInput(
  sb: SupabaseClient,
  clientId: string,
  clientName: string,
  windowDays: SummaryWindow,
): Promise<ClientSummaryInput> {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const sinceIso = since.toISOString().slice(0, 10);

  // ── Readiness check-ins ──────────────────────────────────────────────
  const { data: readinessData } = await sb
    .from("readiness_entries")
    .select(
      "entry_date, total_score, fatigue_energy, sleep_quality, sleep_duration, " +
      "stress_mood, muscle_soreness, sore_areas, notes, color",
    )
    .eq("player_id", clientId)
    .gte("entry_date", sinceIso)
    .order("entry_date", { ascending: true });

  const readiness = ((readinessData ?? []) as unknown) as ReadinessRow[];

  // Sore-area frequency over the window. sore_areas is JSON; expect either an
  // array of strings or {areas: string[]}. Defensive parsing — third-party
  // mobile clients have produced both shapes historically.
  const areaCounts = new Map<string, number>();
  for (const r of readiness) {
    const raw = r.sore_areas;
    let areas: string[] = [];
    if (Array.isArray(raw)) areas = raw.filter((x): x is string => typeof x === "string");
    else if (raw && typeof raw === "object" && Array.isArray((raw as { areas?: unknown }).areas)) {
      areas = ((raw as { areas: unknown[] }).areas).filter((x): x is string => typeof x === "string");
    }
    for (const a of areas) areaCounts.set(a, (areaCounts.get(a) ?? 0) + 1);
  }
  const soreAreaCounts = Array.from(areaCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area, count]) => ({ area, count }));

  // ── Plan adherence ───────────────────────────────────────────────────
  // player_daily_workout is the source of truth for "what was prescribed
  // and what the client did". For PT clients with custom programmes,
  // entries are inserted by the trainer's plan flow.
  const { data: workoutData } = await sb
    .from("player_daily_workout")
    .select("day_date, planned_day_type, decision_source")
    .eq("player_id", clientId)
    .gte("day_date", sinceIso);
  const workouts = (workoutData ?? []) as Array<{
    day_date: string; planned_day_type: string | null; decision_source: string | null;
  }>;
  const scheduledDays = workouts.filter((w) => !!w.planned_day_type && w.planned_day_type !== "REST").length;
  // For PT, "completed" = entry with planned non-REST type + matching readiness
  // entry on the same day (no separate session-log table yet). This is a soft
  // proxy — once we add an explicit completion checkbox it'll be replaced.
  const readinessDates = new Set(readiness.map((r) => r.entry_date));
  const completedDays = workouts.filter(
    (w) => w.planned_day_type && w.planned_day_type !== "REST" && readinessDates.has(w.day_date),
  ).length;

  // ── Active injuries ──────────────────────────────────────────────────
  const { data: injuryData } = await sb
    .from("injury_events")
    .select("type, body_area, status, started_at, resolved_at")
    .eq("player_id", clientId)
    .or("resolved_at.is.null,resolved_at.gte." + sinceIso)
    .order("started_at", { ascending: false });
  const activeInjuries = ((injuryData ?? []) as Array<{
    type: string; body_area: string | null; status: string | null;
    started_at: string | null; resolved_at: string | null;
  }>)
    .filter((i) => !i.resolved_at)
    .map((i) => ({ type: i.type, body_area: i.body_area, status: i.status }));

  // ── Active Explosive Power assignment ────────────────────────────────
  const { data: epData } = await sb
    .from("pt_explosive_programme_assignments")
    .select("level, current_phase, status")
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let explosivePower: ClientSummaryInput["explosivePower"] = null;
  if (epData) {
    const ep = epData as { level: string; current_phase: number };
    // Map phase 1-4 to weeks-label for the prompt.
    const labels = ["Weeks 1-3 (Accumulation)", "Weeks 4-6 (Basic Strength)", "Weeks 7-9 (Strength-Power)", "Weeks 10-12 (Realisation)"];
    explosivePower = {
      level: ep.level,
      current_phase: ep.current_phase,
      weeks_label: labels[Math.max(0, Math.min(3, ep.current_phase - 1))] ?? null,
    };
  }

  // ── Most recent LV Profile test ──────────────────────────────────────
  const { data: lvData } = await sb
    .from("lv_profile_tests")
    .select("exercise, predicted_1rm_kg, profile, tested_at")
    .eq("client_id", clientId)
    .order("tested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lvProfile = lvData as ClientSummaryInput["lvProfile"];

  // ── Chat activity (count only; never content fed to the LLM) ─────────
  const { count: chatMessageCount } = await sb
    .from("player_coach_messages")
    .select("id", { count: "exact", head: true })
    .eq("player_id", clientId)
    .gte("created_at", sinceIso);

  // ── Session RPE (Foster sRPE) ────────────────────────────────────────
  // session_rpe_entries is the canonical source (replaces legacy
  // player_session_rpe). Borg CR-10 scale, session_load = rpe × duration_min.
  const { data: rpeData } = await sb
    .from("session_rpe_entries")
    .select("session_date, rpe, duration_minutes, session_load")
    .eq("player_id", clientId)
    .gte("session_date", sinceIso)
    .order("session_date", { ascending: true });
  const rpeRows = ((rpeData ?? []) as unknown) as Array<{
    session_date: string; rpe: number | null; duration_minutes: number | null; session_load: number | null;
  }>;
  const meanRpe = (vals: Array<number | null>) => {
    const nums = vals.filter((v): v is number => typeof v === "number");
    if (nums.length === 0) return null;
    return Number((nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(2));
  };
  let rpeTrend: "up" | "down" | "flat" | null = null;
  if (rpeRows.length >= 4) {
    const mid = Math.floor(rpeRows.length / 2);
    const first = meanRpe(rpeRows.slice(0, mid).map((r) => r.rpe));
    const second = meanRpe(rpeRows.slice(mid).map((r) => r.rpe));
    if (first !== null && second !== null) {
      const d = second - first;
      rpeTrend = Math.abs(d) < 0.4 ? "flat" : d > 0 ? "up" : "down";
    }
  }
  const sessionRpe = {
    sessions_logged: rpeRows.length,
    avg_rpe: meanRpe(rpeRows.map((r) => r.rpe)),
    avg_duration_min: meanRpe(rpeRows.map((r) => r.duration_minutes)),
    avg_session_load: meanRpe(rpeRows.map((r) => r.session_load)),
    trend_rpe: rpeTrend,
  };

  // ── Per-exercise weight progression ──────────────────────────────────
  // Pull every set logged in the window, group by exercise. For each
  // exercise pick the heaviest set per session (top set) and compare the
  // earliest session's top set vs the latest. Estimated 1RM via Epley
  // (Epley 1985): e1RM = weight × (1 + reps/30).
  const { data: setData } = await sb
    .from("pt_exercise_set_logs")
    .select("exercise_name, session_date, weight_kg, reps, rpe")
    .eq("player_id", clientId)
    .gte("session_date", sinceIso);
  const sets = ((setData ?? []) as unknown) as Array<{
    exercise_name: string; session_date: string; weight_kg: number | null; reps: number | null; rpe: number | null;
  }>;
  // Group: exercise → date → best set (by RIR-aware e1RM, falling back to weight)
  type TopSet = { weight: number; reps: number; rpe: number | null };
  const byExercise = new Map<string, Map<string, TopSet>>();
  for (const s of sets) {
    if (s.weight_kg == null || s.reps == null) continue;
    if (!byExercise.has(s.exercise_name)) byExercise.set(s.exercise_name, new Map());
    const dayMap = byExercise.get(s.exercise_name)!;
    const existing = dayMap.get(s.session_date);
    const score = e1rmFromSet(s.weight_kg, s.reps, s.rpe);
    const existingScore = existing ? e1rmFromSet(existing.weight, existing.reps, existing.rpe) : -Infinity;
    if (score > existingScore) dayMap.set(s.session_date, { weight: Number(s.weight_kg), reps: Number(s.reps), rpe: s.rpe });
  }
  const progression: ClientSummaryInput["progression"] = Array.from(byExercise.entries())
    .map(([exercise_name, dayMap]) => {
      const days = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      const first = days[0]?.[1] ?? null;
      const last = days[days.length - 1]?.[1] ?? null;
      let pctChange: number | null = null;
      if (first && last) {
        const a = e1rmFromSet(first.weight, first.reps, first.rpe);
        const b = e1rmFromSet(last.weight, last.reps, last.rpe);
        if (a > 0) pctChange = Number((((b - a) / a) * 100).toFixed(1));
      }
      return {
        exercise_name,
        sessions: days.length,
        first_top_set: first ? { weight_kg: first.weight, reps: first.reps } : null,
        last_top_set: last ? { weight_kg: last.weight, reps: last.reps } : null,
        pct_change_e1rm: pctChange,
      };
    })
    // Show exercises with the most data first; cap at 4 to keep prompt small.
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 4);

  // ── Foster monotony + strain (last 7 days, end-of-window anchor) ─────
  // Always computed on a 7-day rolling window regardless of the summary
  // window — Foster's interpretation only makes sense at week-scale.
  const last7 = new Date(); last7.setDate(last7.getDate() - 7);
  const last7Iso = last7.toISOString().slice(0, 10);
  const fosterRows = rpeRows.filter((r) => r.session_date >= last7Iso && r.session_load != null);
  const foster = computeFosterMonotonyStrain(
    fosterRows.map((r) => ({ date: r.session_date, load: Number(r.session_load) })),
    7,
  );

  // ── Heavy-lifting exposure (last 7 days) ─────────────────────────────
  const heavySets = sets
    .filter((s) => s.weight_kg != null && s.reps != null && s.session_date >= last7Iso)
    .map((s) => ({ date: s.session_date, weight_kg: Number(s.weight_kg), reps: Number(s.reps) }));
  const exposure = computeHeavyLiftingExposure(heavySets, 7);

  return {
    clientName,
    windowDays,
    readiness,
    scheduledDays,
    completedDays,
    soreAreaCounts,
    activeInjuries,
    explosivePower,
    lvProfile,
    chatMessageCount: chatMessageCount ?? 0,
    sessionRpe,
    progression,
    foster: {
      monotony: foster.monotony, strain: foster.strain,
      status: foster.status, reason: foster.reason,
    },
    exposure: {
      heavy_sets: exposure.heavy_sets, cap: exposure.cap,
      saturation: exposure.saturation, status: exposure.status,
      reason: exposure.reason,
    },
  };
}

/* ── Prompt + Claude call ───────────────────────────────────────────────── */

const SYSTEM_PROMPT_BASE = `You are a sport-science assistant summarising one personal-training client's last few weeks for the trainer.

Audience:
- A personal trainer reviewing the client between sessions.
- They already know the client; do NOT re-explain who the client is.

Tone:
- Direct, useful, concrete. No filler ("appears to be doing well", "shows promise").
- One actionable observation per sentence.

Rules:
- Base every claim on the provided JSON. Never invent numbers, dates, body parts, or exercise names.
- Numbers in 1-decimal form when comparing to baseline (e.g., "sleep 5.6 vs 7.0 baseline").
- The client has NO GPS, NO IMA, NO sprint distance, NO accel/decel data. Never mention any of those.
- If the data is sparse, say so explicitly ("only 3 check-ins in 14 days — limited signal").
- Adherence math: if scheduledDays > 0, report completedDays/scheduledDays. Never round to a "perfect" number it isn't.
- Sore-area patterns only when count ≥ 3 over the window.
- Active injuries always get one sentence each.

Session RPE (Borg CR-10, Foster sRPE):
- 1-3 easy, 4-6 moderate, 7-8 hard, 9-10 max effort.
- If trend_rpe = "up" and readiness trend = "down" → flag overload risk (Gabbett 2017 ACWR principle).
- avg_session_load = avg_rpe × avg_duration_min, arbitrary units. Use when commenting on weekly load.

Strength progression:
- For each entry in "progression", report top-set change ONLY when sessions ≥ 3.
- Use pct_change_e1rm to qualify: <2% = "flat", 2-5% = "small gain", >5% = "meaningful gain".
- Negative pct_change_e1rm = regression — flag it; could indicate fatigue, technique, or deload.
- Never invent exercise names. If progression array is empty, say "no logged sets yet".

Foster monotony × strain (overload detector — Foster 1998):
- foster_monotony_strain.status:
    "deload_required"    → recommend a deload week explicitly. Drop volume 40-50%.
    "deload_recommended" → recommend a 30% volume drop or one rest day.
    "watch"              → mention the pattern but no action yet.
    "ok"                 → don't bring it up unless asked.
- Always cite the monotony number when flagging (e.g., "monotony 1.62, strain 4800").

Heavy-lifting exposure (Pareja-Blanco 2017):
- heavy_lifting_exposure.status:
    "excessive" → flag fatigue risk; suggest scaling next session intensity.
    "high"      → mention the client is at the weekly cap; hold here.
    "optimal"   → positive note ("in the productive zone").
    "low"       → only mention if other signals suggest readiness for more.
- Always cite the count (e.g., "26/25 sets ≥80%1RM").

Output format — JSON only, no markdown:
{
  "digest":  "<≤14 words, one line, for a dashboard list>",
  "summary": "<3-5 sentence paragraph for client detail>"
}`;

const SYSTEM_PROMPT_IS = `${SYSTEM_PROMPT_BASE}

LANGUAGE: Reply in Icelandic. Use natural Icelandic punctuation. "vs baseline" → "vs grunnlína". Sentence-case the digest.`;

const SYSTEM_PROMPT_EN = `${SYSTEM_PROMPT_BASE}

LANGUAGE: Reply in English. Sentence-case the digest.`;

function summariseReadiness(rows: ReadinessRow[]): {
  n: number;
  avgTotal: number | null;
  avgSleep: number | null;
  avgFatigue: number | null;
  avgSoreness: number | null;
  trendTotal: "up" | "down" | "flat" | null;
} {
  const n = rows.length;
  if (n === 0) {
    return { n: 0, avgTotal: null, avgSleep: null, avgFatigue: null, avgSoreness: null, trendTotal: null };
  }
  const mean = (vals: Array<number | null>) => {
    const nums = vals.filter((v): v is number => typeof v === "number");
    if (nums.length === 0) return null;
    return Number((nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(2));
  };
  // Linear trend: split window in halves and compare averages.
  let trendTotal: "up" | "down" | "flat" | null = null;
  if (n >= 4) {
    const mid = Math.floor(n / 2);
    const first = mean(rows.slice(0, mid).map((r) => r.total_score));
    const second = mean(rows.slice(mid).map((r) => r.total_score));
    if (first !== null && second !== null) {
      const delta = second - first;
      trendTotal = Math.abs(delta) < 0.5 ? "flat" : delta > 0 ? "up" : "down";
    }
  }
  return {
    n,
    avgTotal: mean(rows.map((r) => r.total_score)),
    avgSleep: mean(rows.map((r) => r.sleep_quality)),
    avgFatigue: mean(rows.map((r) => r.fatigue_energy)),
    avgSoreness: mean(rows.map((r) => r.muscle_soreness)),
    trendTotal,
  };
}

export function buildPromptPayload(input: ClientSummaryInput) {
  const s = summariseReadiness(input.readiness);
  return {
    client_name: input.clientName,
    window_days: input.windowDays,
    readiness: {
      n: s.n,
      avg_total: s.avgTotal,
      avg_sleep_quality: s.avgSleep,
      avg_fatigue_energy: s.avgFatigue,
      avg_muscle_soreness: s.avgSoreness,
      trend_total: s.trendTotal,
    },
    session_rpe: input.sessionRpe,
    foster_monotony_strain: input.foster,
    heavy_lifting_exposure: input.exposure,
    adherence: {
      scheduled_days: input.scheduledDays,
      completed_days: input.completedDays,
    },
    progression: input.progression,
    sore_area_top: input.soreAreaCounts,
    active_injuries: input.activeInjuries,
    explosive_power: input.explosivePower,
    lv_profile_latest: input.lvProfile,
    chat_messages_in_window: input.chatMessageCount,
  };
}

async function callClaude(payload: unknown, lang: SummaryLang): Promise<{ output: ClientSummaryOutput; tokens: { input?: number; output?: number } }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const system = lang === "EN" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_IS;
  const userMessage = `Client data (JSON):\n\n${JSON.stringify(payload, null, 2)}\n\nWrite the JSON now. JSON only.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:       PT_SUMMARY_MODEL,
      max_tokens:  PT_SUMMARY_MAX_TOKENS,
      system,
      messages:    [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Claude API ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json() as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  if (!text) throw new Error("Claude returned no text content");

  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let parsed: { digest?: string; summary?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
  if (!parsed.digest || !parsed.summary) {
    throw new Error("Claude response missing digest or summary");
  }
  return {
    output: { digest: parsed.digest.trim(), summary: parsed.summary.trim() },
    tokens: { input: json.usage?.input_tokens, output: json.usage?.output_tokens },
  };
}

/**
 * Top-level: fetch inputs, guard empty-state, run Claude, return output.
 * Caller writes to pt_client_summary_cache on success.
 */
export async function generateClientSummary(
  sb: SupabaseClient,
  clientId: string,
  clientName: string,
  windowDays: SummaryWindow,
  lang: SummaryLang,
): Promise<{ output: ClientSummaryOutput | null; readinessN: number; tokens: { input?: number; output?: number } } > {
  const input = await buildClientSummaryInput(sb, clientId, clientName, windowDays);
  if (input.readiness.length < MIN_READINESS_FOR_SUMMARY) {
    return { output: null, readinessN: input.readiness.length, tokens: {} };
  }
  const payload = buildPromptPayload(input);
  const { output, tokens } = await callClaude(payload, lang);
  return { output, readinessN: input.readiness.length, tokens };
}

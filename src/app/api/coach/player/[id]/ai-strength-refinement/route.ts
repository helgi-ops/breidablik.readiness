/**
 * POST /api/coach/player/[id]/ai-strength-refinement
 *
 * AI Refinement Layer (Path A) — the deterministic engine already
 * prescribed today's session, and the coach manual override pipeline is
 * already in place. This endpoint adds a SUGGESTION layer that reads:
 *
 *   • Today's prescribed session (engine output)
 *   • Last 14 days of readiness_entries — especially the `notes` free-text
 *     field where players write soreness / sleep / personal context
 *   • Last 14 days of athlete_decision_history (verdict streaks)
 *   • Sprint Speed Drop, Sprint Exposure, CoD asymmetry, decel burden,
 *     Foster Strain (all pre-computed in the snapshot)
 *   • Active injury / RTP status
 *   • Recent match minutes (load context)
 *
 * …and sends them to Claude Haiku with a strict prompt. Claude returns
 * 0–3 suggested swaps, each citing the specific signals that drove the
 * suggestion. Coach reviews and one-click applies (using existing
 * strength-override endpoint).
 *
 * The AI cannot:
 *   - Invent exercises (server validates every suggested ID against the
 *     EXERCISE_LIBRARY)
 *   - Cross categories (suggested ID must share the original's category —
 *     no replacing a compound with a mobility drill)
 *   - Apply changes itself (everything goes through coach review)
 *
 * Gating: ELITE tier only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isEliteTeam, ELITE_REQUIRED_RESPONSE } from "@/lib/micropulse/elite";
import { loadPlayerStrengthSnapshot, loadCoachOverrides } from "@/lib/micropulse/strengthProgramming/loader";
import { buildStrengthSession, EXERCISES_BY_ID } from "@/lib/micropulse/strengthProgramming";
import type { MdContext, StrengthSession } from "@/lib/micropulse/strengthProgramming/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 800;
const MAX_SUGGESTIONS = 3;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getCoachAuth(req: NextRequest, supabase: ReturnType<typeof getSupabase>) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 } as const;
  }
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { userId, teamId } as const;
}

function parseMdOverride(raw: string | null | undefined): MdContext | null {
  if (!raw) return null;
  const v = raw.toUpperCase().trim();
  switch (v) {
    case "4": case "MD-4": return "MD-4";
    case "3": case "MD-3": return "MD-3";
    case "2": case "MD-2": return "MD-2";
    case "1": case "MD-1": return "MD-1";
    case "+1": case "MD+1": return "MD+1";
    default: return null;
  }
}

/** Load extra history context that the snapshot doesn't already carry. */
async function loadAiContext(
  supabase: ReturnType<typeof getSupabase>,
  playerId: string,
  todayIso: string,
) {
  const start14 = (() => {
    const d = new Date(`${todayIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 13);
    return d.toISOString().slice(0, 10);
  })();

  const [readinessHistory, decisionHistory, recentMatches] = await Promise.all([
    // Wellness with notes — the gold mine
    supabase
      .from("readiness_entries")
      .select("entry_date, sleep_quality, muscle_soreness, fatigue_energy, stress_mood, sore_areas, notes, total_score")
      .eq("player_id", playerId)
      .gte("entry_date", start14)
      .lte("entry_date", todayIso)
      .order("entry_date", { ascending: false })
      .limit(14),
    // Verdict streaks
    supabase
      .from("athlete_decision_history")
      .select("decision_date, verdict_action")
      .eq("player_id", playerId)
      .gte("decision_date", start14)
      .lte("decision_date", todayIso)
      .order("decision_date", { ascending: false })
      .limit(14),
    // Recent matches with minutes (load context)
    supabase
      .from("match_player_minutes")
      .select("match_date, minutes_played")
      .eq("player_id", playerId)
      .gte("match_date", start14)
      .lte("match_date", todayIso)
      .order("match_date", { ascending: false })
      .limit(5),
  ]);

  return {
    readiness: (readinessHistory.data ?? []) as Array<{
      entry_date: string; sleep_quality: number | null;
      muscle_soreness: number | null; fatigue_energy: number | null;
      stress_mood: number | null; sore_areas: string[] | null;
      notes: string | null; total_score: number | null;
    }>,
    decisions: (decisionHistory.data ?? []) as Array<{
      decision_date: string; verdict_action: string | null;
    }>,
    matches: (recentMatches.data ?? []) as Array<{
      match_date: string; minutes_played: number | null;
    }>,
  };
}

type SuggestedOverride = {
  blockId: string;
  position: number;
  currentExerciseId: string;
  suggestedExerciseId: string;
  reason: string;
  citedSignals: string[];
  confidence: "low" | "moderate" | "high";
};

type AiRefinementOutput = {
  suggestedOverrides: SuggestedOverride[];
  narrative: string;
  suggestedPlayerNote?: string;
  generatedAt: string;
};

function buildSystemPrompt(): string {
  return `You are MicroPulse, an evidence-based strength refinement engine for football S&C coaches.

Context:
- A deterministic engine has already prescribed today's session (cluster sets, French Contrast, weightlifting derivatives, Nordic / Copenhagen injury-prevention block).
- 13 sport-science rules have already fired (sore-hamstring swap, decel-burden swap, sprint-drop iso swap, CoD asymmetry unilateral, VBT load reduction, verdict-driven volume cut, etc.).
- Your job is the NUANCE layer the rule engine can't see: free-text wellness notes, multi-day patterns, holistic synthesis.

You will receive structured JSON: the prescribed session, the player's last 14 days of readiness entries (including free-text \`notes\`), recent verdict streaks, match minutes, and current signal values.

═══════ HARD RULES ═══════

1. SUGGEST 0–3 swaps. EMPTY array is a valid response — don't manufacture changes.
2. Each suggested exercise MUST be one of the IDs listed in available_exercises. Server validates this — invalid IDs are dropped.
3. Each suggestion MUST stay in the SAME category as the current exercise (compound→compound, posterior→posterior, etc.). Categories are listed.
4. Each suggestion MUST cite specific signals it relied on (e.g. ["readiness note 2026-05-11: 'mjóhryggur stífur'", "verdict streak: MODIFIED x3"]).
5. Reasons must be 1 line, plain coach English, no marketing language, no jargon the coach hasn't seen.
6. NEVER suggest changes that conflict with the engine's already-fired rules (e.g. don't re-add Nordic if the engine swapped it for iso ham).
7. NEVER invent player names or signal values not in the input.
8. Confidence: "high" only when a clear free-text note or strong multi-day pattern drives the swap.

Output STRICTLY this JSON shape:
{
  "suggestedOverrides": [
    {
      "blockId": "...",
      "position": 0,
      "currentExerciseId": "ex_...",
      "suggestedExerciseId": "ex_...",
      "reason": "1-line coach English",
      "citedSignals": ["..."],
      "confidence": "low" | "moderate" | "high"
    }
  ],
  "narrative": "2–3 lines coach-facing — what the AI saw + why these refinements",
  "suggestedPlayerNote": "Optional 1-2 sentence note in plain language the coach can forward to the player. Leave empty if no swap was made."
}`;
}

/** Compose the user message — the full structured context. */
function buildUserPayload(
  playerName: string,
  session: StrengthSession,
  snapshot: Awaited<ReturnType<typeof loadPlayerStrengthSnapshot>>,
  ctx: Awaited<ReturnType<typeof loadAiContext>>,
): string {
  // Catalogue of valid exercise IDs by category — keep tight so prompt stays compact
  const byCategory = new Map<string, Array<{ id: string; nameEN: string }>>();
  EXERCISES_BY_ID.forEach((ex) => {
    if (!byCategory.has(ex.category)) byCategory.set(ex.category, []);
    byCategory.get(ex.category)!.push({ id: ex.id, nameEN: ex.nameEN });
  });
  const availableExercises: Record<string, Array<{ id: string; name: string }>> = {};
  byCategory.forEach((arr, cat) => {
    availableExercises[cat] = arr.map((e) => ({ id: e.id, name: e.nameEN }));
  });

  // Prescribed session shape — what the engine landed on after adaptations
  const prescribed = session.blocks.map((b) => ({
    blockId: b.id,
    title: b.titleEN,
    exercises: b.exercises.map((e, i) => ({
      position: i,
      exerciseId: e.exerciseId,
      name: e.nameEN,
      category: e.category,
      dose: `${e.dose.sets} × ${e.dose.reps} @ ${e.dose.intensity}`,
      modificationReason: e.modificationReason ?? null,
    })),
  }));

  const enginesAlreadyFired = session.appliedAdaptations.map((a) => ({
    rule: a.ruleId,
    trigger: a.triggerEN,
    action: a.actionEN,
  }));

  // Trim readiness to fields Claude needs
  const readinessTrim = ctx.readiness.map((r) => ({
    date: r.entry_date,
    sleep: r.sleep_quality,
    soreness: r.muscle_soreness,
    fatigue: r.fatigue_energy,
    stress: r.stress_mood,
    sore_areas: r.sore_areas ?? [],
    notes: r.notes && r.notes.trim().length > 0 ? r.notes.trim().slice(0, 200) : null,
  }));

  return JSON.stringify({
    player_name: playerName,
    md_context: snapshot.mdContext,
    today: snapshot.todayIso,
    verdict_today: snapshot.verdict,
    current_signals: {
      sprint_speed_drop_pct: snapshot.sprintSpeedDropPct,
      sprint_exposure_band: snapshot.sprintExposureBand,
      cod_asymmetry_pct: snapshot.codAsymmetryPct,
      cod_weaker_side: snapshot.codWeakerSide,
      decel_burden_band: snapshot.decelBurdenBand,
      decel_burden_high_streak_days: snapshot.decelBurdenHighStreakDays,
      vbt_decrement: snapshot.vbtDecrement,
      injury_status: snapshot.injuryStatus,
      foster_monotony: snapshot.fosterMonotony,
      foster_strain: snapshot.fosterStrain,
      is_congested_week: snapshot.isCongestedWeek,
    },
    wellness_14d: readinessTrim,
    verdict_history_14d: ctx.decisions.map((d) => ({
      date: d.decision_date,
      verdict: d.verdict_action,
    })),
    recent_matches: ctx.matches.map((m) => ({
      date: m.match_date,
      minutes: m.minutes_played,
    })),
    prescribed_session: prescribed,
    engine_rules_already_fired: enginesAlreadyFired,
    available_exercises_by_category: availableExercises,
  });
}

async function callClaude(systemPrompt: string, userMessage: string): Promise<unknown> {
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
  const cleaned = textContent.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  return JSON.parse(cleaned);
}

/** Validate + sanitize Claude's output against actual session shape. */
function sanitize(
  raw: unknown,
  session: StrengthSession,
): AiRefinementOutput {
  const out: AiRefinementOutput = {
    suggestedOverrides: [],
    narrative: "",
    generatedAt: new Date().toISOString(),
  };
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  if (typeof o.narrative === "string") out.narrative = o.narrative.slice(0, 600);
  if (typeof o.suggestedPlayerNote === "string" && o.suggestedPlayerNote.trim().length > 0) {
    out.suggestedPlayerNote = o.suggestedPlayerNote.trim().slice(0, 400);
  }

  const list = Array.isArray(o.suggestedOverrides) ? o.suggestedOverrides : [];
  for (const item of list.slice(0, MAX_SUGGESTIONS)) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const blockId = String(s.blockId ?? "");
    const position = Number(s.position);
    const currentExerciseId = String(s.currentExerciseId ?? "");
    const suggestedExerciseId = String(s.suggestedExerciseId ?? "");

    // Validate suggested exercise is in our library
    const newEx = EXERCISES_BY_ID.get(suggestedExerciseId);
    if (!newEx) continue;
    // Validate block + position match what was actually prescribed
    const block = session.blocks.find((b) => b.id === blockId);
    if (!block) continue;
    if (!Number.isInteger(position) || position < 0 || position >= block.exercises.length) continue;
    const currentEx = block.exercises[position];
    if (currentEx.exerciseId !== currentExerciseId) continue;
    // Enforce same-category swap
    if (currentEx.category !== newEx.category) continue;
    // Reject no-ops
    if (suggestedExerciseId === currentExerciseId) continue;

    const reason = typeof s.reason === "string" ? s.reason.slice(0, 280) : "";
    if (!reason.trim()) continue;

    const citedSignals = Array.isArray(s.citedSignals)
      ? (s.citedSignals as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 5)
      : [];

    const confRaw = String(s.confidence ?? "moderate").toLowerCase();
    const confidence: "low" | "moderate" | "high" =
      confRaw === "low" ? "low" : confRaw === "high" ? "high" : "moderate";

    out.suggestedOverrides.push({
      blockId,
      position,
      currentExerciseId,
      suggestedExerciseId,
      reason,
      citedSignals,
      confidence,
    });
  }

  return out;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  if (!playerId) return NextResponse.json({ error: "Missing player id" }, { status: 400 });

  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // ELITE gate
  const elite = await isEliteTeam(supabase, auth.teamId);
  if (!elite) return NextResponse.json(ELITE_REQUIRED_RESPONSE, { status: 402 });

  // Verify player on coach's team
  const { data: playerRow } = await supabase
    .from("players").select("id, team_id, full_name").eq("id", playerId).maybeSingle();
  if (!playerRow || (playerRow as { team_id: string }).team_id !== auth.teamId) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  let body: { md?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch { /* empty body OK */ }
  const mdOverride = parseMdOverride(body.md);

  const todayIso = new Date().toISOString().slice(0, 10);

  // Load snapshot + existing coach overrides → build the session as it stands today.
  const [snapshot, existingOverrides, ctx] = await Promise.all([
    loadPlayerStrengthSnapshot(supabase, {
      playerId,
      playerName: (playerRow as { full_name: string | null }).full_name ?? undefined,
      teamId: auth.teamId,
      todayIso,
      mdContextOverride: mdOverride,
    }),
    loadCoachOverrides(supabase, { playerId, dateIso: todayIso }),
    loadAiContext(supabase, playerId, todayIso),
  ]);

  const session = buildStrengthSession(snapshot, existingOverrides);
  if (!session) {
    return NextResponse.json(
      { error: "No session prescribed today — nothing to refine." },
      { status: 400 },
    );
  }

  // No exercises means injury / OFF / RECOVERY — nothing to refine
  const totalEx = session.blocks.reduce((s, b) => s + b.exercises.length, 0);
  if (totalEx === 0) {
    return NextResponse.json({
      ok: true,
      mdContext: snapshot.mdContext,
      result: {
        suggestedOverrides: [],
        narrative: "Player has no strength session today (rehab / recovery / off-day). Nothing to refine.",
        generatedAt: new Date().toISOString(),
      } as AiRefinementOutput,
    });
  }

  const userMessage = buildUserPayload(
    (playerRow as { full_name: string | null }).full_name ?? "Player",
    session,
    snapshot,
    ctx,
  );

  let claudeRaw: unknown;
  try {
    claudeRaw = await callClaude(buildSystemPrompt(), userMessage);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI generation failed" },
      { status: 500 },
    );
  }

  const result = sanitize(claudeRaw, session);

  return NextResponse.json({
    ok: true,
    mdContext: snapshot.mdContext,
    result,
  });
}

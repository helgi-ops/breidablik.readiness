/**
 * /api/coach/player/[id]/decel-summary
 *
 * Returns a 2-4 sentence plain-language explanation of the player's current
 * decel intelligence numbers. Built specifically for coaches without S&C
 * background — translates the 6 McBurnie/Dos'Santos/Osgnach metrics into
 * coach speak ("braking exceeds acceleration — one-sided movement").
 *
 * Architecture lesson from 2026-04-29:
 *   - Pre-compute interpretation labels in TypeScript (decelNarrative lib)
 *   - LLM only writes prose around the labels, never computes its own
 *     interpretation of the raw numbers
 *   - Per-metric validator catches direction-flip hallucinations
 *
 * GET — fetch cached or generate new (uses 4h cache same as overall summary)
 * POST — force regeneration
 *
 * English only by design. Cached per (player, day).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildDecelInterpretation,
  validateDecelNarrative,
  type RawDecelInputs,
} from "@/lib/micropulse/decelNarrative";
import { isEliteTeam, ELITE_REQUIRED_RESPONSE } from "@/lib/micropulse/elite";

export const runtime = "nodejs";
export const maxDuration = 30;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 280;
const CACHE_TTL_HOURS = 4;

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

// ─── Fetch the same data the Decel Intel page already shows ─────────────────
async function fetchDecelInputs(
  supabase: ReturnType<typeof getSupabase>,
  playerId: string,
): Promise<RawDecelInputs | null> {
  // Player meta
  const { data: pinfo } = await supabase
    .from("players")
    .select("full_name, position")
    .eq("id", playerId)
    .maybeSingle();
  if (!pinfo) return null;

  // Decel sub-engine status (McBurnie 2022)
  const { data: decelData } = await supabase.rpc("get_mcburnie_decel_status", {
    p_player_id: playerId,
  });

  // Sharp Cut Load (Dos'Santos 2021)
  const { data: cutData } = await supabase
    .from("v_sharp_cut_hip_er_risk")
    .select("cuts_7d, cuts_28d, cuts_personal_z, cuts_flag")
    .eq("player_id", playerId)
    .maybeSingle();

  // MPE Recovery (Osgnach 2023) — compute z-score from rolling 7d vs 28d
  const today = new Date().toISOString().slice(0, 10);
  const start28 = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
  const { data: mpeRows } = await supabase
    .from("player_external_load_daily")
    .select("date, mpe_recovery_avg_s")
    .eq("player_id", playerId)
    .gte("date", start28)
    .lte("date", today)
    .not("mpe_recovery_avg_s", "is", null);

  type MpeRow = { date: string; mpe_recovery_avg_s: number };
  const validMpe = ((mpeRows ?? []) as MpeRow[])
    .filter((r) => Number.isFinite(Number(r.mpe_recovery_avg_s)) && Number(r.mpe_recovery_avg_s) > 0);

  let mpe_recovery: RawDecelInputs["mpe_recovery"] = null;
  if (validMpe.length >= 4) {
    const all = validMpe.map((r) => Number(r.mpe_recovery_avg_s));
    const mean28 = all.reduce((a, x) => a + x, 0) / all.length;
    const sd28 = Math.sqrt(
      all.reduce((a, x) => a + (x - mean28) ** 2, 0) / Math.max(all.length - 1, 1),
    );
    const sevenAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const recent7 = validMpe.filter((r) => r.date >= sevenAgo).map((r) => Number(r.mpe_recovery_avg_s));
    if (recent7.length > 0 && sd28 > 0) {
      const recentAvg = recent7.reduce((a, x) => a + x, 0) / recent7.length;
      const z = (recentAvg - mean28) / sd28;
      mpe_recovery = {
        recent_7d_avg_s: Math.round(recentAvg),
        baseline_28d_avg_s: Math.round(mean28),
        z_score: Number(z.toFixed(2)),
        flag: z >= 1.0 ? "red" : z >= 0.5 ? "yellow" : "green",
      };
    }
  }

  type DecelStatus = {
    overload?: { flag: "green" | "yellow" | "red" | "unknown"; cumulative_28d_count: number; baseline_daily_mean: number };
    underload?: { flag: "green" | "yellow" | "red" | "unknown"; cumulative_7d_count: number; match_day_demand: number; match_days_observed: number };
    accel_coupling?: { flag: "green" | "yellow" | "red" | "unknown"; recent_ratio: number; healthy_range: string };
    sprint_coupling?: { flag: "green" | "yellow" | "red" | "unknown"; recent_ratio: number; healthy_range: string };
    concentration?: { flag: "green" | "yellow" | "red" | "unknown"; peak_day_pct_of_28d: number; distinct_high_intensity_days: number };
  };
  const d = (decelData ?? {}) as DecelStatus;

  return {
    player_name: pinfo.full_name as string,
    position: (pinfo.position as string | null) ?? null,
    overload: d.overload ?? null,
    underload: d.underload ?? null,
    accel_coupling: d.accel_coupling ?? null,
    sprint_coupling: d.sprint_coupling ?? null,
    concentration: d.concentration ?? null,
    sharp_cut: (cutData as RawDecelInputs["sharp_cut"]) ?? null,
    mpe_recovery,
  };
}

// ─── Claude call ────────────────────────────────────────────────────────────
function buildSystemPrompt(): string {
  return `You are an assistant for football head coaches and S&C staff.

Your job is to translate pre-computed decel-intelligence labels into a short
plain-language explanation that a coach without sport-science background can
read in 10 seconds.

You will receive a JSON object with:
  - player.name
  - metrics: a dictionary of {label, value_text, direction, severity, coach_phrase}
    — the coach_phrase is HOW you should describe each metric. Use it as-is or
      lightly paraphrase.
  - overall.headline_phrase — what the player's overall decel state is.

═══════ HARD RULES ═══════

1. Do NOT compute your own interpretation of the raw numbers. The pre-computed
   direction and coach_phrase are the only authoritative readings. If
   ad_coupling.direction = "below_healthy" you MUST say braking exceeds
   acceleration — never say the coupling is healthy or balanced.

2. Use ONLY phrases that align with each metric's direction. Each metric has
   forbidden_when_used phrases that contradict its direction; using any of
   those will fail validation.

3. Keep it to 2-4 sentences. Coach scans in seconds.

4. Lead sentence: if overall.has_any_red, lead with the most urgent concern
   (use overall.headline_phrase). If only watches, lead with the watched
   metric. If all clear, say so plainly.

5. Middle sentence: explain WHY this matters in coach terms. Use coach_phrase
   from the relevant metric.

6. Final sentence (only if needed): one concrete action — "spread high-intensity
   work across more sessions", "add accel/sprint coupling drills", "monitor
   for the rest of the week".

7. NEVER cite a number that is not in the input value_text or coach_phrase.
   NEVER invent additional metrics not in the input. NEVER say "compared to
   the squad" — we don't have squad context here.

8. ENGLISH ONLY.

Output JSON only, no surrounding text:
{ "narrative": "2-4 sentence English explanation" }`;
}

async function callClaude(systemPrompt: string, userMessage: string): Promise<{ narrative: string }> {
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
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let parsed: { narrative?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
  if (!parsed.narrative) throw new Error(`Claude response missing 'narrative' field`);
  return { narrative: parsed.narrative.trim() };
}

// ─── Cache (uses player_daily_summary table with a 'decel-' summary_kind suffix) ──
// Reuses the existing summary cache table by namespacing the row with a
// well-known kind suffix so it doesn't collide with the overall AI summary.
async function readCache(
  supabase: ReturnType<typeof getSupabase>,
  playerId: string,
  todayIso: string,
): Promise<{ narrative: string; generated_at: string } | null> {
  // Schema: player_daily_summary.summary_en holds the text;
  //         date_generated is the day key; summary_kind = 'decel'
  //         distinguishes from the overall summary.
  const { data } = await supabase
    .from("player_daily_summary")
    .select("summary_en, generated_at")
    .eq("player_id", playerId)
    .eq("date_generated", todayIso)
    .eq("summary_kind", "decel")
    .maybeSingle();
  if (!data) return null;
  const generated_at = data.generated_at as string | null;
  if (!generated_at) return null;
  const ageHours = (Date.now() - Date.parse(generated_at)) / 3_600_000;
  if (ageHours > CACHE_TTL_HOURS) return null;
  return { narrative: data.summary_en as string, generated_at };
}

async function writeCache(
  supabase: ReturnType<typeof getSupabase>,
  playerId: string,
  teamId: string,
  todayIso: string,
  narrative: string,
): Promise<void> {
  await supabase.from("player_daily_summary").upsert(
    {
      player_id: playerId,
      team_id: teamId,
      date_generated: todayIso,
      summary_kind: "decel",
      summary_en: narrative,
      // Mirror into summary_is too (English-only feature, but the column is
      // NOT NULL on some installs — safer to write both than gamble).
      summary_is: narrative,
      generated_at: new Date().toISOString(),
      window_days: 7,
      model_version: CLAUDE_MODEL,
    },
    { onConflict: "player_id,date_generated,summary_kind" },
  );
}

// ─── Generation flow ───────────────────────────────────────────────────────
async function generate(
  supabase: ReturnType<typeof getSupabase>,
  playerId: string,
  teamId: string,
): Promise<NextResponse> {
  const inputs = await fetchDecelInputs(supabase, playerId);
  if (!inputs) {
    return NextResponse.json(
      { error: "No decel data for this player" },
      { status: 404 },
    );
  }

  const interp = buildDecelInterpretation(inputs);
  const userMessage = `Player: ${interp.player.name}\n\nDecel interpretation:\n${JSON.stringify(interp, null, 2)}\n\nWrite the narrative now. JSON only.`;
  const systemPrompt = buildSystemPrompt();

  let result: { narrative: string };
  let issues: string | null = null;
  try {
    result = await callClaude(systemPrompt, userMessage);
    issues = validateDecelNarrative(result.narrative, interp);
    if (issues) {
      console.warn("[decel-summary] First attempt failed validation, retrying", { issues });
      const retryHint = `\n\nIMPORTANT: Your previous attempt failed validation: ${issues}. Re-check the metric directions and use ONLY the coach_phrase fields as the source of truth.`;
      result = await callClaude(systemPrompt, userMessage + retryHint);
      issues = validateDecelNarrative(result.narrative, interp);
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Generation failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
  if (issues) {
    return NextResponse.json(
      {
        error: `Validation failed after retry: ${issues}`,
        narrative: result.narrative,
      },
      { status: 422 },
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  await writeCache(supabase, playerId, teamId, todayIso, result.narrative);

  return NextResponse.json({
    ok: true,
    cached: false,
    narrative: result.narrative,
    generated_at: new Date().toISOString(),
    interpretation: interp,
  });
}

// ─── GET (cache-aware) ─────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  if (!playerId) return NextResponse.json({ error: "Missing player id" }, { status: 400 });

  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getSupabase();

  // ELITE-tier gate.
  const isElite = await isEliteTeam(supabase, auth.teamId);
  if (!isElite) {
    return NextResponse.json(ELITE_REQUIRED_RESPONSE.body, { status: ELITE_REQUIRED_RESPONSE.status });
  }

  // Verify player belongs to team
  const { data: playerCheck } = await supabase
    .from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  if (!playerCheck || playerCheck.team_id !== auth.teamId) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const cached = await readCache(supabase, playerId, todayIso);
  if (cached) {
    return NextResponse.json({
      ok: true,
      cached: true,
      narrative: cached.narrative,
      generated_at: cached.generated_at,
    });
  }

  return generate(supabase, playerId, auth.teamId);
}

// ─── POST (force regeneration) ─────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  if (!playerId) return NextResponse.json({ error: "Missing player id" }, { status: 400 });

  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getSupabase();

  // ELITE-tier gate (same as GET).
  const isElite = await isEliteTeam(supabase, auth.teamId);
  if (!isElite) {
    return NextResponse.json(ELITE_REQUIRED_RESPONSE.body, { status: ELITE_REQUIRED_RESPONSE.status });
  }

  const { data: playerCheck } = await supabase
    .from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  if (!playerCheck || playerCheck.team_id !== auth.teamId) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  return generate(supabase, playerId, auth.teamId);
}

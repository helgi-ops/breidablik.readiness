/**
 * /api/coach/weekly-story
 *
 * POST — generate a 1-paragraph weekly story for the coach. AI-written
 * narrative covering the last 7 days: who improved, who declined, where
 * the load went, what to plan into next week.
 *
 * Same architecture as /api/coach/team-analysis (the ELITE daily deeper-
 * interpretation button) but with a WEEKLY scope and a single paragraph
 * deliverable rather than two. Designed to be read on Friday afternoon
 * as a wrap-up before the weekend.
 *
 * Aligns with explainability-first principle #5: AI explains, rules
 * decide. The deterministic engine has already produced per-day verdicts;
 * this endpoint feeds those + load deltas + injuries to Claude and asks
 * for cross-day pattern + 1-week-ahead intent. Never originates a
 * recommendation; only narrates the data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { isEliteTeam, ELITE_REQUIRED_RESPONSE } from "@/lib/micropulse/elite";
import { EXCLUDE_PREV_CLUB_OR } from "@/lib/micropulse/load/previousClub";

export const runtime = "nodejs";
export const maxDuration = 30;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 320;


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
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 };
  }
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 };
  return { userId, teamId };
}

type WeekFacts = {
  team_name: string;
  week_start_iso: string;
  week_end_iso: string;
  // Per-day color counts + the planned day type + focus, so the AI can
  // narrate what KIND of week it was (FORCE / NEURAL / GAME-week / OFF-heavy).
  days: Array<{
    date: string;
    full: number;
    modified: number;
    recovery: number;
    day_type: string | null;
    focus: string | null;
  }>;
  // Players whose 7d z-mean dropped vs prior 21d (declining trajectory)
  declining_players: string[];
  // Players who came OUT of yellow/red into green this week
  improving_players: string[];
  // Active injuries snapshot
  injured_players: string[];
  // Team load delta: acute (7d) vs chronic (28d) PL mean
  acwr_team: number | null;
  load_delta_pct: number | null;
  // Match count + total minutes context
  match_days_in_week: number;
  // Override pattern this week
  override_count_7d: number;
  override_directions: { tougher: number; lighter: number; lateral: number };
};

async function gatherWeekFacts(
  supabase: ReturnType<typeof getSupabase>,
  teamId: string,
): Promise<WeekFacts | null> {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const sevenAgoIso = new Date(today.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  const fourteenAgoIso = new Date(today.getTime() - 13 * 86_400_000).toISOString().slice(0, 10);
  const twentyEightAgoIso = new Date(today.getTime() - 27 * 86_400_000).toISOString().slice(0, 10);

  const { data: team } = await supabase
    .from("teams").select("name").eq("id", teamId).maybeSingle();
  if (!team) return null;

  const { data: pl } = await supabase
    .from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const players = (pl ?? []) as Array<{ id: string; full_name: string | null }>;
  const playerIds = players.map((p) => p.id);
  const nameById = new Map(players.map((p) => [p.id, p.full_name ?? "—"]));

  // Per-day verdict counts across the week.
  //
  // NOTE: column on athlete_decision_history is `session_mode` (lowercase
  // values: 'full'/'modified'/'recovery'/'pending'), NOT `training_action`.
  // The earlier version of this code used `training_action` which doesn't
  // exist — Supabase returned empty rows silently and the AI was told the
  // squad hadn't trained all week. Fixed 2026-05-27.
  //
  // The day_type from week_plans is the authoritative source for what kind
  // of day each was (TRAIN / GAME / OFF), and the focus tells us what KIND
  // of session was planned (FORCE / NEURAL+VELOCITY / ACTIVATION etc.).
  // We surface both to the AI so it can write specific narrative.
  const days: WeekFacts["days"] = [];
  if (playerIds.length > 0) {
    const { data: dh } = await supabase
      .from("athlete_decision_history")
      .select("decision_date, athlete_state, session_mode")
      .in("player_id", playerIds)
      .gte("decision_date", sevenAgoIso)
      .lte("decision_date", todayIso);
    const grouped = new Map<string, { full: number; modified: number; recovery: number }>();
    for (const r of (dh ?? []) as Array<{ decision_date: string; session_mode: string | null }>) {
      const day = r.decision_date;
      const mode = String(r.session_mode ?? "").toLowerCase();
      const bucket = grouped.get(day) ?? { full: 0, modified: 0, recovery: 0 };
      if (mode === "full") bucket.full += 1;
      else if (mode === "modified" || mode === "reduced") bucket.modified += 1;
      else if (mode === "recovery" || mode === "hold") bucket.recovery += 1;
      grouped.set(day, bucket);
    }
    // Day-type + focus from week_plans — authoritative source for what
    // kind of day each was.
    const { data: wp } = await supabase
      .from("week_plans").select("day_date, day_type, focus")
      .eq("team_id", teamId)
      .gte("day_date", sevenAgoIso).lte("day_date", todayIso);
    const planByDate = new Map(
      ((wp ?? []) as Array<{ day_date: string; day_type: string | null; focus: string | null }>)
        .map((r) => [r.day_date, { day_type: r.day_type, focus: r.focus }])
    );
    // Walk back 7 days so we always have a 7-row series even when some
    // days have no entries.
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10);
      const counts = grouped.get(d) ?? { full: 0, modified: 0, recovery: 0 };
      const plan = planByDate.get(d);
      days.push({
        date: d,
        ...counts,
        day_type: plan?.day_type ?? null,
        focus: plan?.focus ?? null,
      });
    }
  }

  // Declining + improving players — 7d z-mean vs prior 14d
  const declining_players: string[] = [];
  const improving_players: string[] = [];
  if (playerIds.length > 0) {
    const { data: zh } = await supabase
      .from("athlete_decision_history")
      .select("player_id, z_today, decision_date")
      .in("player_id", playerIds)
      .gte("decision_date", twentyEightAgoIso)
      .lte("decision_date", todayIso);
    const byPlayer = new Map<string, Array<{ d: string; z: number }>>();
    for (const r of (zh ?? []) as Array<{ player_id: string; z_today: number | null; decision_date: string }>) {
      if (r.z_today == null || !Number.isFinite(r.z_today)) continue;
      const arr = byPlayer.get(r.player_id) ?? [];
      arr.push({ d: r.decision_date, z: Number(r.z_today) });
      byPlayer.set(r.player_id, arr);
    }
    for (const [pid, arr] of byPlayer) {
      const recent = arr.filter((x) => x.d >= sevenAgoIso).map((x) => x.z);
      const prior = arr.filter((x) => x.d < sevenAgoIso && x.d >= fourteenAgoIso).map((x) => x.z);
      if (recent.length < 3 || prior.length < 3) continue;
      const m1 = recent.reduce((s, x) => s + x, 0) / recent.length;
      const m0 = prior.reduce((s, x) => s + x, 0) / prior.length;
      if (m0 - m1 >= 0.5) declining_players.push(nameById.get(pid) ?? "—");
      else if (m1 - m0 >= 0.5) improving_players.push(nameById.get(pid) ?? "—");
    }
  }

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

  // ACWR + load delta — same approach as team-analysis
  let acwr_team: number | null = null;
  let load_delta_pct: number | null = null;
  if (playerIds.length > 0) {
    const { data: ext } = await supabase
      .from("player_external_load_daily")
      .select("date, total_player_load")
      .in("player_id", playerIds)
      .or(EXCLUDE_PREV_CLUB_OR) // team ACWR rolls players by date — exclude pre-transfer rows
      .gte("date", twentyEightAgoIso).lte("date", todayIso);
    const dayBuckets = new Map<string, number[]>();
    for (const r of (ext ?? []) as Array<{ date: string; total_player_load: number | null }>) {
      if (r.total_player_load == null || r.total_player_load <= 0) continue;
      const arr = dayBuckets.get(r.date) ?? [];
      arr.push(Number(r.total_player_load));
      dayBuckets.set(r.date, arr);
    }
    const dayMean = new Map<string, number>();
    for (const [d, arr] of dayBuckets) dayMean.set(d, arr.reduce((s, x) => s + x, 0) / arr.length);
    const acute = Array.from(dayMean.entries()).filter(([d]) => d >= sevenAgoIso).map(([, v]) => v);
    const chronic = Array.from(dayMean.values());
    const acuteMean = acute.length > 0 ? acute.reduce((s, x) => s + x, 0) / acute.length : null;
    const chronicMean = chronic.length > 0 ? chronic.reduce((s, x) => s + x, 0) / chronic.length : null;
    if (acuteMean != null && chronicMean != null && chronicMean > 0) {
      acwr_team = Math.round((acuteMean / chronicMean) * 100) / 100;
      load_delta_pct = Math.round(((acuteMean / chronicMean) - 1) * 100);
    }
  }

  // Match days in the week
  let match_days_in_week = 0;
  try {
    const { data: mm } = await supabase
      .from("match_player_minutes")
      .select("match_date")
      .in("player_id", playerIds)
      .gte("match_date", sevenAgoIso).lte("match_date", todayIso)
      .gte("minutes_played", 60);
    const dates = new Set<string>();
    for (const r of (mm ?? []) as Array<{ match_date: string }>) if (r.match_date) dates.add(r.match_date);
    match_days_in_week = dates.size;
  } catch { /* best-effort */ }

  // Override pattern this week — from the new decision_override_log
  let override_count_7d = 0;
  const override_directions = { tougher: 0, lighter: 0, lateral: 0 };
  try {
    const { data: ovr } = await supabase
      .from("decision_override_log")
      .select("override_direction")
      .eq("team_id", teamId)
      .gte("decision_date", sevenAgoIso);
    for (const r of (ovr ?? []) as Array<{ override_direction: "tougher" | "lighter" | "lateral" }>) {
      override_count_7d += 1;
      override_directions[r.override_direction] = (override_directions[r.override_direction] ?? 0) + 1;
    }
  } catch { /* best-effort, table may not be deployed yet */ }

  return {
    team_name: String(team.name ?? "Team"),
    week_start_iso: sevenAgoIso,
    week_end_iso: todayIso,
    days,
    declining_players,
    improving_players,
    injured_players,
    acwr_team,
    load_delta_pct,
    match_days_in_week,
    override_count_7d,
    override_directions,
  };
}

function buildSystemPrompt(): string {
  return `You are an assistant for football head coaches and S&C staff.

Your job: write a single-paragraph WEEKLY STORY for the coach to read at the end of the week. The deterministic engine has computed per-day verdicts and load deltas — you weave those into a narrative that names what HAPPENED across the week and what it MEANS for next week's planning.

You will receive a JSON object with weekly team facts: day-by-day verdict counts, declining / improving players, injuries, ACWR + load delta, override pattern, match days.

═══════ HARD RULES ═══════

1. NEVER invent numbers, players, or events not in the input. Only use what is in the JSON.
2. Use player names by first name only ("Hákon", not "Hákon Jónsson"). NEVER make up names.
3. One paragraph, ~80–120 words. Not bullet points.
4. The paragraph must do three things, in this order:
   (a) Name the SHAPE of the week — what days were TRAIN / GAME / OFF (from each day's day_type + focus), and the dominant verdict pattern on training days.
   (b) Name the PEOPLE STORIES — who improved, who declined, any active injuries. Be specific.
   (c) Name one CONCRETE THING TO CARRY into next week (a player to watch, a load target, a recovery focus).
5. ALWAYS describe the week's SESSIONS using the days[] array — day_type tells you what TYPE of day each was (TRAIN/GAME/OFF/etc.), focus tells you what KIND of training was planned. NEVER conclude "no sessions" just because verdict counts are zero; an OFF day will naturally have low or zero verdict counts. Count the TRAIN and GAME days from day_type as evidence of what the squad did.
6. Plain coach English — no jargon (no "ACWR", "z-score", "composite", "MD-3").
   Translate: ACWR → "training load vs his usual", declining z → "trending down", etc.
7. If override_count_7d > 0, mention briefly only if it's a notable pattern (e.g. "you went tougher on 5 of 7 days" suggests the engine was conservative). Otherwise skip.
8. ENGLISH ONLY. No Icelandic.
9. Output JSON only: { "weekly_story": "single paragraph here" }`;
}

async function callClaude(systemPrompt: string, userMessage: string): Promise<{ weekly_story: string }> {
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
  let parsed: { weekly_story?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned non-JSON: ${cleaned.slice(0, 200)}`);
  }
  return { weekly_story: String(parsed.weekly_story ?? "").trim() };
}

export async function POST(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getSupabase();

  const isElite = await isEliteTeam(supabase, auth.teamId);
  if (!isElite) {
    return NextResponse.json(ELITE_REQUIRED_RESPONSE.body, { status: ELITE_REQUIRED_RESPONSE.status });
  }

  const facts = await gatherWeekFacts(supabase, auth.teamId);
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
      week_start: facts.week_start_iso,
      week_end: facts.week_end_iso,
      weekly_story: result.weekly_story,
      facts_used: facts,
    });
  } catch (err) {
    return NextResponse.json({
      error: "AI generation failed",
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

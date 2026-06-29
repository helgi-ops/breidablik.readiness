/**
 * /api/player/game-report/narrative
 *
 * POST — the PLAYER's OWN AI summary of his season physical profile, written to
 * him in the second person ("you ran…"). Self-scoped: the player_id comes from
 * his auth, never a param, and the numbers are RE-COMPUTED server-side from his
 * own report — the client cannot supply or tamper with figures.
 *
 * Explainability rules (manifesto #5): the AI only rephrases real numbers, cites
 * the actual signals, invents nothing, makes no medical/injury or transfer/
 * recruitment claims, and is labelled as AI in the UI. Rules decide; AI explains.
 *
 * Body: { lang?: "EN" | "IS" }  (numbers are NOT taken from the body)
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId, getPlayerTeamId } from "@/lib/session-rpe/server";
import { computePlayerGameReport } from "@/lib/micropulse/playerGameReport";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You write a short, encouraging physical-performance summary addressed directly to a football player ("you"), from his own GPS and match-load data.

Hard rules:
- Use ONLY the numbers given in the user message. Never invent or estimate values.
- Describe ONLY the metrics actually present in the data (see metric_guide) — different clubs capture different signals, so do not mention a metric that is absent (e.g. change of direction or jumps may not be provided).
- Reference metrics by their plain meaning (distance covered, high-speed running, sprinting, accelerations/decelerations, hard efforts, high metabolic load, change of direction, top speed). No raw jargon ("band 5-8", "IMA", "ACWR").
- Per-90 means "per 90 minutes" — comparable across matches. Percentile/rank is within your own squad.
- Speak to the player in the second person, factual and positive but not hyperbolic. No medical or injury claims. No transfer-value or recruitment advice. No training prescriptions.
- Name one clear strength and one area with room to grow, both grounded in the numbers.
- 80-130 words, 2 short paragraphs. Plain language a player reads in 20 seconds.
- Write in the requested language only. Return prose only — no headings, no bullet points, no preamble.`;

const METRIC_GUIDE: Record<string, string> = {
  total_distance: "metres covered per 90",
  hsr: "high-speed running metres per 90",
  sprint: "sprinting metres per 90",
  player_load: "overall mechanical workload per 90",
  accel: "accelerations per 90",
  decel: "decelerations per 90",
  ima_acc: "explosive accelerations per 90",
  ima_dec: "explosive decelerations per 90",
  cod: "change-of-direction actions per 90",
  jumps: "jumps per 90",
  ima_hsr: "high-intensity running metres per 90",
  efforts: "hard accelerations and decelerations combined, per 90",
  hml: "high metabolic load distance (intense running) per 90",
  top_speed_kmh: "peak sprint speed (km/h)",
};

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();

  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const lang = body?.lang === "IS" ? "Icelandic" : "English";

  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season")) || new Date().getUTCFullYear();

  const teamId = await getPlayerTeamId(sb, playerId);
  if (!teamId) return NextResponse.json({ error: "Player not linked to a team" }, { status: 400 });

  // Re-compute from the player's own report — the AI never sees client numbers.
  const res = await computePlayerGameReport(sb, teamId, playerId, season);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const report = res.report;

  if (report.summary.matches_with_gps === 0) {
    return NextResponse.json({ error: "No match data yet" }, { status: 422 });
  }

  // Keep only the metrics the club captures (top speed always kept — it's a peak).
  const availableKeys = report.availableKeys;
  const isAvail = (k: string) => k === "top_speed_kmh" || availableKeys.includes(k);
  // The per-band HIR breakdown (ima_hir5-8) is a radar detail; the AI describes
  // high-intensity running via the lumped `ima_hsr` only — keep the bands out.
  const HIDE = new Set(["ima_hir5", "ima_hir6", "ima_hir7", "ima_hir8"]);
  const pick = (obj: Record<string, unknown> | null | undefined) =>
    Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => isAvail(k) && !HIDE.has(k)));

  const facts = {
    player: { name: report.player.full_name, position: report.player.position ?? "unknown", age: report.player.age ?? "unknown" },
    season: report.season.year,
    matches_played: report.summary.matches_played,
    matches_with_gps: report.summary.matches_with_gps,
    total_minutes: report.summary.total_minutes,
    per_90_averages: pick(report.summary.per90_avg),
    best_top_speed_kmh: report.summary.best_top_speed_kmh,
    squad_benchmarks: pick(report.benchmarks),
    metric_guide: Object.fromEntries(Object.entries(METRIC_GUIDE).filter(([k]) => isAvail(k))),
  };

  const userMsg = `Write the summary in ${lang}, addressed to the player. Data (JSON):\n${JSON.stringify(facts)}`;

  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, temperature: 0.4, system: SYSTEM, messages: [{ role: "user", content: userMsg }] }),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 });
  }
  if (!aiRes.ok) return NextResponse.json({ error: `AI ${aiRes.status}: ${(await aiRes.text()).slice(0, 200)}` }, { status: 502 });

  const json = (await aiRes.json()) as { content?: Array<{ type: string; text?: string }> };
  const narrative = (json.content?.find((c) => c.type === "text")?.text ?? "").trim();
  if (!narrative) return NextResponse.json({ error: "Empty AI response" }, { status: 502 });

  return NextResponse.json({ ok: true, narrative, model: MODEL });
}

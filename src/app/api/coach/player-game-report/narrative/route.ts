/**
 * /api/coach/player-game-report/narrative
 *
 * POST — generate a plain-language physical-profile summary for an agent from
 * the already-computed report numbers. The AI ONLY rephrases the supplied
 * figures (per the explainability rules: it cites real signals, invents
 * nothing, and is labelled as AI in the UI). Coach/staff only.
 *
 * Body: { player, summary, benchmarks, lang: "EN" | "IS" }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "claude-haiku-4-5-20251001";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function requireCoach(req: NextRequest) {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  return { ok: true } as const;
}

const SYSTEM = `You write a short physical-performance profile of a football player for the player's AGENT, from GPS and match-load data.

Hard rules:
- Use ONLY the numbers given in the user message. Never invent or estimate values.
- Describe ONLY the metrics actually present in the data (see metric_guide) — different clubs capture different signals, so do not mention a metric that is absent (e.g. change of direction or jumps may not be provided).
- Reference metrics by their plain meaning (distance covered, high-speed running, sprinting, accelerations/decelerations, hard efforts, high metabolic load, change of direction, top speed). No raw jargon ("band 5-8", "IMA", "ACWR").
- Per-90 means "per 90 minutes" — comparable across matches. Percentile/rank is within this player's own squad.
- Be factual and positive but not hyperbolic. No medical or injury claims. No transfer-value or recruitment advice.
- 90-140 words, 2 short paragraphs. Plain language a non-specialist agent reads in 20 seconds.
- Write in the requested language only. Return prose only — no headings, no bullet points, no preamble.`;

export async function POST(req: NextRequest) {
  const auth = await requireCoach(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const lang = body?.lang === "IS" ? "Icelandic" : "English";
  const player = body?.player ?? {};
  const summary = body?.summary ?? {};
  const benchmarks = body?.benchmarks ?? {};
  // Which metrics this club actually captures (drop-empty, from the report). When
  // absent we keep every metric for back-compat. `top_speed_kmh` is always kept —
  // it's a peak, reported separately from the per-90 averages.
  const availableKeys: string[] | null = Array.isArray(body?.availableKeys) ? body.availableKeys : null;
  const isAvail = (k: string) => k === "top_speed_kmh" || !availableKeys || availableKeys.includes(k);

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

  // Keep only the metrics the club captures — so the AI never describes a
  // flat-zero column a Core/Lite team doesn't measure.
  // The per-band HIR breakdown (ima_hir5-8) is a radar detail; the AI describes
  // high-intensity running via the lumped `ima_hsr` only — keep the bands out.
  const HIDE = new Set(["ima_hir5", "ima_hir6", "ima_hir7", "ima_hir8"]);
  const pick = (obj: Record<string, unknown> | null | undefined) =>
    Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => isAvail(k) && !HIDE.has(k)));

  const facts = {
    player: { name: player.full_name, position: player.position ?? "unknown", age: player.age ?? "unknown" },
    season: player.season ?? summary.year ?? null,
    matches_played: summary.matches_played,
    matches_with_gps: summary.matches_with_gps,
    total_minutes: summary.total_minutes,
    per_90_averages: pick(summary.per90_avg),
    best_top_speed_kmh: summary.best_top_speed_kmh,
    squad_benchmarks: pick(benchmarks), // each: {player, team_avg, percentile, rank, n}
    metric_guide: Object.fromEntries(Object.entries(METRIC_GUIDE).filter(([k]) => isAvail(k))),
  };

  const userMsg = `Write the profile in ${lang}. Data (JSON):\n${JSON.stringify(facts)}`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, temperature: 0.4, system: SYSTEM, messages: [{ role: "user", content: userMsg }] }),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: `AI ${res.status}: ${(await res.text()).slice(0, 200)}` }, { status: 502 });

  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const narrative = (json.content?.find((c) => c.type === "text")?.text ?? "").trim();
  if (!narrative) return NextResponse.json({ error: "Empty AI response" }, { status: 502 });

  return NextResponse.json({ ok: true, narrative, model: MODEL });
}

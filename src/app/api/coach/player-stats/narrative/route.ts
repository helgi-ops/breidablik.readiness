/**
 * /api/coach/player-stats/narrative
 *
 * POST — a short plain-language SEASON summary of a player's Wyscout football
 * stats, for the coach. The AI ONLY rephrases the supplied figures (per the
 * explainability rules: cites real signals, invents nothing, labelled as AI in
 * the UI). Descriptive match data only — it says NOTHING about readiness,
 * fitness-to-play, training load, or transfer value. Coach/staff only.
 *
 * Body: { name, position, season, football: { core, metrics }, lang: "EN"|"IS" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import {
  pickPlayerFootballStats,
  positionFamily,
  type FootballStatInput,
} from "@/lib/micropulse/playerFootballStats";

export const runtime = "nodejs";
export const maxDuration = 30;

const MODEL = "claude-haiku-4-5-20251001";

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

const SYSTEM = `You write a short SEASON summary of a football player from his own match statistics (Wyscout), for the player's COACH.

Hard rules:
- Use ONLY the numbers given in the user message. Never invent, estimate, or infer a value that isn't there.
- These are the stats picked for the player's position, so lead with what matters for that position (a forward: goals/shots/box presence; a winger: dribbles/crosses/chance creation; a midfielder: passing/progression/duels; a defender: duels/interceptions/passing; a keeper: saves/clean sheets).
- Reference stats by plain meaning. "per 90" means "per 90 minutes played" — comparable regardless of minutes. "xG" = the quality of chances, "xA" = the chance-creating value of passes. A "–" or missing value means the stat was not reported — never call it zero.
- Be factual and positive but not hyperbolic. NO injury or medical claims. NO transfer-value, market, or recruitment advice.
- CRITICAL: say NOTHING about the player's readiness, fitness to play, training load, or availability — these are descriptive match stats only and never a training or selection recommendation.
- 60-110 words, 1-2 short paragraphs. Plain language a head coach reads in 20 seconds.
- Write in the requested language only. Return prose only — no headings, no bullet points, no preamble.`;

export async function POST(req: NextRequest) {
  const auth = await requireCoach(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const lang = body?.lang === "IS" ? "Icelandic" : "English";
  const name = typeof body?.name === "string" ? body.name : "the player";
  const position = typeof body?.position === "string" ? body.position : null;
  const season = body?.season ?? null;
  const football = (body?.football ?? {}) as { core?: FootballStatInput["core"]; metrics?: FootballStatInput["metrics"] };

  const input: FootballStatInput = { core: football.core ?? {}, metrics: football.metrics ?? {} };
  // Feed the model exactly the position-curated stats the coach sees — grounded,
  // plain-labelled, and already position-aware (so it can't wander to noise).
  const curated = pickPlayerFootballStats(input, position, lang === "Icelandic" ? "IS" : "EN")
    .map((s) => ({ stat: s.label, value: s.value == null ? "not reported" : s.display }));

  const facts = {
    player: { name, position: position ?? "unknown", position_group: positionFamily(position) },
    season,
    key_stats: curated,
  };

  const userMsg = `Write the summary in ${lang}. Data (JSON):\n${JSON.stringify(facts)}`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 500, temperature: 0.4, system: SYSTEM, messages: [{ role: "user", content: userMsg }] }),
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/player/basketball-ai-summary
 *   POST { facts, lang } → a short, AI-labelled, player-facing read of the player's OWN season, written
 *   strictly from the box-score facts the Match tab already shows them (season averages, shooting splits,
 *   best game, and — when present — their InStat play-type / efficiency variables). Self-scoped: the
 *   player is authenticated; the client passes what it displays. Warm, honest self-review — it phrases
 *   the numbers, never invents.
 *
 * Descriptive, for motivation + self-review — NEVER the readiness colour, load, or any training verdict.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

const AI_MODEL = "claude-haiku-4-5-20251001";

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  try { await requireAuthedPlayerId(sb, req); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const facts = body?.facts;
  if (!facts || typeof facts !== "object") return NextResponse.json({ ok: false, error: "facts are required" }, { status: 400 });
  const language = String(body?.lang ?? "EN").toUpperCase() === "IS" ? "Icelandic" : "English";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI summary unavailable (no API key configured)." }, { status: 503 });

  const system = `You are a basketball coach writing a short, encouraging season read FOR THE PLAYER THEMSELVES, STRICTLY from the player's own box-score facts (season per-game averages, shooting splits as makes/attempts for 2PT/3PT/FT, best game, and any InStat play-type / efficiency numbers). Rules:
- Address the player directly as "you". Use ONLY the numbers provided; never invent games, stats, teammates or events.
- Write 2 short paragraphs, each led by a bold label:
  **What's working** — your clearest strengths from the numbers (scoring, the shot types you hit well, rebounding, playmaking, defense), cite the actual numbers and be genuinely encouraging.
  **One thing to work on** — the single clearest area to improve from the numbers (e.g. a low shooting %, turnovers, a shot type you miss), framed constructively as a next step, not criticism.
- Plain, warm language a teenager or adult amateur reads happily. This is for motivation and self-review — NEVER mention readiness, load, fitness, injury, or any training decision.
- Write in ${language}.
Return ONLY a JSON object: {"summary": string} where summary is the two paragraphs, separated by a blank line, each starting with its bold label.`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 900, system, messages: [{ role: "user", content: `My season facts:\n${JSON.stringify(facts).slice(0, 6000)}` }] }),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "AI request failed." }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ ok: false, error: `AI summary failed (${res.status}).` }, { status: 502 });

  const j = await res.json();
  let text = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  text = a >= 0 && b > a ? text.slice(a, b + 1) : text;
  try {
    const parsed = JSON.parse(text) as { summary?: unknown };
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    return summary ? NextResponse.json({ ok: true, summary }) : NextResponse.json({ ok: false, error: "The model didn't return a readable summary." }, { status: 422 });
  } catch {
    return NextResponse.json({ ok: false, error: "The model didn't return a readable summary." }, { status: 422 });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/basketball-game-summary
 *   POST { facts, lang } → a short, AI-labelled summary of ONE game, written strictly from the
 *   box-score facts the Single Match view already computed (score, Four Factors, leaders). The
 *   client passes what it displays; the model phrases the numbers only — it never invents.
 *
 * Descriptive scouting — never touches the readiness colour, load, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  return { ok: true } as const;
}

const AI_MODEL = "claude-haiku-4-5-20251001";

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const facts = body?.facts;
  if (!facts || typeof facts !== "object") return NextResponse.json({ ok: false, error: "facts are required" }, { status: 400 });
  const language = String(body?.lang ?? "EN").toUpperCase() === "IS" ? "Icelandic" : "English";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI summary unavailable (no API key configured)." }, { status: 503 });

  const system = `You are a basketball analyst writing a SHORT summary of ONE game for a head coach, STRICTLY from the box-score facts given (final score, Four Factors, and the game's statistical leaders). Rules: use ONLY the numbers provided; never invent plays, events, stats or names not in the facts; say who won and the margin, then the 1-2 factors that decided it (from the Four Factors — eFG%, turnovers, offensive rebounding, free-throw rate) and the leading performers; refer to players by the names given; plain language; a PERFORMANCE read, never a readiness/medical/training verdict. Write in ${language}. Return ONLY a JSON object: {"summary": string (3-4 sentences)}.`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 600, system, messages: [{ role: "user", content: `Game facts:\n${JSON.stringify(facts).slice(0, 4000)}` }] }),
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

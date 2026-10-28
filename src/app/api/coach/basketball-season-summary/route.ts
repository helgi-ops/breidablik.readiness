export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/basketball-season-summary
 *   POST { facts, lang } → a DETAILED, AI-labelled review of the whole basketball season, written
 *   strictly from the facts the Season Match Analysis view already computed: record and scoring,
 *   the Four Factors (own vs opponent), shooting/rebounding/ball-control, home/away and win/loss
 *   splits, per-opponent results, quarter patterns, shot playtypes/zones and the season leaders.
 *   The client passes exactly what it displays; the model phrases the numbers — it never invents.
 *
 * Descriptive scouting — never touches the readiness verdict, load, or the daily decision.
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

  const system = `You are a basketball analyst writing a DETAILED season review for a head coach, STRICTLY from the statistics given (record and scoring, Four Factors own vs opponent, shooting/rebounding/ball-control, home/away and win-vs-loss splits, per-opponent results, quarter-by-quarter scoring, shot playtypes/zones, and the season leaders). Rules:
- Use ONLY the numbers provided; never invent plays, events, stats, opponents or names not in the facts. If a section's data is absent, skip it silently — do not mention that it is missing.
- Walk through EVERY category present in the facts, in this order, each as its own short paragraph led by a bold label: Overview (record, points for/against, margin); Four Factors (which of eFG%, turnovers, offensive rebounding, free-throw rate win or lose games for this team, comparing own vs opponent); Shooting & scoring (FG/3P/FT, playtypes/zones if present); Rebounding & ball control (REB, OREB%, steals, blocks, turnovers); Splits (home vs away, and what changes between wins and losses — this is the most actionable part, dwell on it); Quarters (where the team builds or loses leads); Personnel (the leaders and what they carry).
- Interpret, don't just restate: say what each number means for how this team wins, and name the clearest strength and the clearest weakness.
- Plain language a non-analyst coach reads at a glance; expand an abbreviation the first time. A PERFORMANCE read only — never a readiness, medical, load or training-decision verdict.
- Write in ${language}. Use "they/them" for any individual player.
Return ONLY a JSON object: {"summary": string} where summary is the full review, paragraphs separated by blank lines, each paragraph starting with its bold label like "**Overview** …".`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 1600, system, messages: [{ role: "user", content: `Season facts:\n${JSON.stringify(facts).slice(0, 12000)}` }] }),
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

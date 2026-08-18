/**
 * /api/coach/sb-team-match-report/narrative
 *
 * POST — a plain-language coach read of one game's StatsBomb TEAM match stats, from the
 * ALREADY-COMPUTED report figures. The AI only phrases the numbers it is given (explainability:
 * cites real numbers, invents nothing, labelled as AI in the UI; rules compute, AI explains).
 * Descriptive football context — it never touches the readiness colour, load, or the daily decision.
 *
 * Body: { report: SbTeamMatchReport, teamName?: string, lang?: "EN" | "IS" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import type { SbTeamMatchReport } from "@/lib/micropulse/matchReport/sbTeamMatchReport";

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

const SYSTEM = `You write a short coach-facing read of ONE football match from its team stats, using ALREADY-COMPUTED figures.

Hard rules:
- Use ONLY the numbers in the user message (JSON). Never invent, estimate, or add metrics that are not present.
- Metrics flagged "estimated": true (e.g. possession %, PPDA) are approximations — say "estimated" when you use them; do not present them as exact.
- Where a metric has a season average, you may say this game was above/below the team's usual; never imply a trend from one game.
- Plain language a head coach reads at a glance. You may name metrics (xG, OBV, deep progressions, PPDA, pressures). No fabricated tactics or mechanisms.
- This is descriptive only: do NOT prescribe training, do NOT mention player readiness/fitness/load, do NOT give team-selection advice.
- 120-180 words, 2-3 short paragraphs: (1) the overall performance — chances created vs conceded (xG), control, the result; (2) how they built up and pressed (passing into the box/final third, pressures/counterpressures, long balls); (3) one honest caveat (one game is a snapshot; note any estimated figures). No headings, no bullets, no preamble. Write in the requested language only.`;

export async function POST(req: NextRequest) {
  const auth = await requireCoach(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const lang = body?.lang === "IS" ? "Icelandic" : "English";
  const report = body?.report as SbTeamMatchReport | undefined;
  if (!report?.sections) return NextResponse.json({ error: "Missing report" }, { status: 400 });

  // Only the computed facts, English labels, own-only-or-paired values (nulls dropped).
  const facts = {
    teamName: body?.teamName ?? null,
    opponent: report.opponent,
    isHome: report.isHome,
    score: report.goals != null && report.goalsAgainst != null ? `${report.goals}-${report.goalsAgainst}` : null,
    verdict: report.headline?.en,
    keyFacts: (report.facts ?? []).map((f) => f.en),
    metrics: report.sections.flatMap((s) =>
      s.metrics.filter((m) => m.own != null).map((m) => ({
        group: s.group, name: m.label.en, you: m.own, opp: m.opp, seasonAvg: m.seasonAvg, estimated: Boolean(m.estimated),
      }))),
  };
  const userMsg = `Write the match read in ${lang}. Team match stats (JSON):\n${JSON.stringify(facts)}`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 700, temperature: 0.3, system: SYSTEM, messages: [{ role: "user", content: userMsg }] }),
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

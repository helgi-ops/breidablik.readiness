/**
 * /api/coach/rtp/narrative
 *
 * POST — plain-language executive summary + per-domain clinical notes for an
 * RTP assessment, from the ALREADY-COMPUTED figures. The AI only rephrases the
 * numbers/statuses it is given (explainability: cites real signals, invents
 * nothing, labelled as AI in the UI; rules decide status, AI explains). Medical
 * content — coach/medical only.
 *
 * Body: { assessment: RtpAssessment, lang?: "EN" | "IS" }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

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

const SYSTEM = `You write the Executive Summary of a Return-to-Play (RTP) force-plate assessment for a sports-medicine/rehab professional, from ALREADY-COMPUTED figures.

Hard rules:
- Use ONLY the numbers and statuses in the user message (JSON). Never invent, estimate, or add tests/metrics that are not present.
- The PASS/CAUTION/FLAG statuses and the clearance decision are computed by rules — restate them; never change or contradict them.
- Note honestly that this is a PARTIAL battery when 'coverage.pending' lists tests (e.g. IMTP, SLDJ) — do not imply those were performed.
- Plain clinical language; you may name metrics (jump height, RSI-modified, limb asymmetry, change-of-direction asymmetry). No fabricated mechanisms.
- 110-170 words, 2 short paragraphs: (1) overall picture + decision, (2) the key strength and the key concern. No headings, no bullets, no preamble. Write in the requested language only.`;

export async function POST(req: NextRequest) {
  const auth = await requireCoach(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const lang = body?.lang === "IS" ? "Icelandic" : "English";
  const assessment = body?.assessment ?? null;
  if (!assessment) return NextResponse.json({ error: "Missing assessment" }, { status: 400 });

  // Send only the computed facts (no PII beyond first name / position).
  const facts = {
    player: { name: assessment.player?.fullName, position: assessment.player?.position, age: assessment.player?.ageYears, bodyMassKg: assessment.player?.bodyMassKg },
    injury: assessment.injury,
    cmj: assessment.cmj,
    cod: assessment.cod,
    criteria: assessment.criteria,
    criteriaMet: assessment.criteriaMet,
    criteriaTotal: assessment.criteriaTotal,
    decision: assessment.decision,
    coverage: assessment.coverage,
  };
  const userMsg = `Write the executive summary in ${lang}. Assessment (JSON):\n${JSON.stringify(facts)}`;

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

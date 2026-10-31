/**
 * /api/coach/load-verdict/explain
 *
 * POST — a plain-language AI "why" for ONE player's load state, for the
 * GPS-only Today Load Summary detail. Mirrors the anti-hallucination pattern
 * of /api/coach/team-analysis: the deterministic engine (loadVerdict +
 * externalLoad/signals) has already decided the band and computed every
 * number; Claude only writes prose AROUND those labelled facts.
 *
 * Explainability contract (CLAUDE.md principle #1 — "rules decide, AI explains"):
 *   - The band is passed in as authoritative. Claude NEVER changes it, and
 *     NEVER invents a number, signal or name not in the payload.
 *   - The UI labels the output as AI and shows the same signals underneath,
 *     so the coach can check the prose against the data.
 *   - Descriptive external-load read only — no readiness/injury/tissue claim.
 *   - English only (Icelandic LLM output had spelling errors — same lesson as
 *     team-analysis).
 *
 * On-demand (one short call per open), coach-auth only. Uses the same Claude
 * Haiku as the existing team AI summary for consistency + cost.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const maxDuration = 30;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const MAX_OUTPUT_TOKENS = 260;

async function getCoachTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase
    .from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  return { ok: true } as const;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
const str = (v: unknown): string => (typeof v === "string" ? v.slice(0, 80) : "");

/** Sanitise the client-supplied facts down to a flat, labelled block. The band
 *  is authoritative; everything else is a number or short label. */
function buildFacts(body: Record<string, unknown>) {
  const band = str((body.band as string) ?? "").toUpperCase();
  const fig = (body.figures ?? {}) as Record<string, unknown>;
  const sig = (body.signals ?? {}) as Record<string, unknown>;
  const ima = (sig.ima ?? {}) as Record<string, unknown>;
  const intensity = (body.intensity ?? {}) as Record<string, unknown>;
  const drivers = Array.isArray(body.drivers)
    ? (body.drivers as Array<Record<string, unknown>>).slice(0, 5).map((d) => ({ signal: str(d.plain ?? d.signal), z: num(d.z) }))
    : [];
  const sz = (s: unknown) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return { value: num(o.value), z: num(o.z) };
  };
  return {
    first_name: str(body.name).split(" ")[0] || "the player",
    band: ["SUSTAINABLE", "BUILDING", "SPIKING", "UNDER"].includes(band) ? band : "SUSTAINABLE",
    acwr: num(fig.acwr),
    body_load: num(fig.bodyLoad),
    hsr_delta_pct: num(fig.hsrDeltaPct),
    drivers,
    decel: sz(sig.decel),
    accel_decel_ratio: num(sig.adRatio),
    load_profile: str(sig.loadProfile as string),
    ima_accel: sz(ima.accel),
    ima_decel: sz(ima.decel),
    ima_total: sz(ima.total),
    intensity: { available: intensity.available === true, band: str(intensity.band as string), z: num(intensity.z), headline: str(intensity.headline as string) },
  };
}

function systemPrompt(): string {
  return `You explain an athlete's external-load state to a football head coach, in plain English.

A deterministic engine has ALREADY decided the load band and computed every number. You add the plain-language "why" around those facts. You are an explainer, never a decider.

You receive a JSON object of pre-computed, authoritative facts for ONE player: the load band (SUSTAINABLE | BUILDING | SPIKING | UNDER), ACWR, body load, HSR delta %, named drivers (with z vs the player's own baseline), deceleration load, accel:decel ratio + load profile, IMA (inertial multidirectional) accel/decel/total, and a work-rate intensity read.

═══════ HARD RULES ═══════
1. NEVER change or second-guess the band — it is already decided. Explain why THIS band, given the numbers.
2. NEVER invent a number, signal, player or event not in the JSON. Use only the values given. Omit anything that is null.
3. 2-3 sentences, ~45-70 words total. Plain coach English — no jargon dumps.
4. Lead with the main driver(s) that explain the band, citing the actual numbers (e.g. "ACWR 1.42 with his decel load 2.3 SD over his norm"). Then one short "what to watch / do".
5. This is an EXTERNAL-LOAD read only. Make NO claim about injury risk, readiness, illness or tissue damage. Never say "ready" / "not ready".
6. First name only. ENGLISH ONLY.
7. Keep the signals distinct — "decel" is the GPS deceleration count; "ima_*" are separate inertial (multidirectional) counts. Don't merge their numbers or attribute one's value to the other.

Output JSON only: { "summary": "..." }`;
}

export async function POST(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const facts = buildFacts(body);
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt(),
        messages: [{ role: "user", content: JSON.stringify(facts) }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ error: `AI error ${res.status}`, detail: text.slice(0, 160) }, { status: 502 });
    }
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    let summary = "";
    try { summary = String((JSON.parse(cleaned) as { summary?: string }).summary ?? "").trim(); }
    catch { summary = cleaned.slice(0, 400); } // tolerate a bare sentence
    if (!summary) return NextResponse.json({ error: "Empty AI response" }, { status: 502 });
    return NextResponse.json({ summary, band: facts.band });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 });
  }
}

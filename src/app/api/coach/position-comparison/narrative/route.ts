/**
 * /api/coach/position-comparison/narrative
 *
 * POST — short squad playing-style overview from the already-computed position
 * archetypes + per-90 profiles. AI ONLY narrates the supplied rule-based
 * findings (labelled "AI" in the UI, invents nothing). Coach/staff only.
 *
 * Body: { groups, squadAvg, lang }
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

const SYSTEM = `You are a football physical-performance analyst summarising how a team's positions differ in movement profile, for the coaching staff.

Hard rules:
- Use ONLY the supplied numbers and archetype labels. Invent nothing.
- The archetype tags were assigned by transparent rules from per-90 GPS/IMA data; you are explaining them, not re-deciding them.
- Plain football language (distance covered, high-speed running, sprinting, accelerations/decelerations, change of direction, top speed). No jargon like "z-score", "IMA", "per-90 percentile".
- Be concrete and comparative ("full backs sprint most, centre backs cover least high-speed running"). No recruitment, tactical-instruction, or medical claims.
- 110-150 words, 2-3 short paragraphs. Write in the requested language only. Prose only.`;

export async function POST(req: NextRequest) {
  const auth = await requireCoach(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const lang = body?.lang === "IS" ? "Icelandic" : "English";
  const facts = {
    squad_average_per_90: body?.squadAvg ?? null,
    positions: (body?.groups ?? []).map((g: Record<string, unknown>) => ({
      group: g.label_en, players: g.players, appearances: g.appearances,
      style: (g.style as { primary?: { en?: string }; secondary?: { en?: string } | null })?.primary?.en,
      also: (g.style as { secondary?: { en?: string } | null })?.secondary?.en ?? null,
      per_90: g.profile,
    })),
    metric_guide: { distance: "metres/90", hsr: "high-speed running m/90", sprint: "sprint m/90", top_speed: "km/h peak", accel: "accelerations/90", decel: "decelerations/90", cod: "change-of-direction/90", jumps: "jumps/90" },
  };

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, temperature: 0.4, system: SYSTEM, messages: [{ role: "user", content: `Write in ${lang}. Data (JSON):\n${JSON.stringify(facts)}` }] }),
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

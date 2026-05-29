/**
 * /api/client/ai-coach — Daily AI Coach for the PT athlete.
 *
 * Manifesto pattern: rules decide, AI explains. We compute real signals from
 * the athlete's data (readiness trend, load ratios, strength/volume trend,
 * recent PB, season/taper context) and hand them to Claude to phrase ONE short,
 * specific, motivating coaching line. The "Based on" chips come from the signals
 * WE fed it — so every citation is real. Labelled as AI on the surface. If the
 * model/key is unavailable the route returns insight:null and the card hides
 * (the hero's deterministic note still covers the athlete).
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { computeLoadQuadrant } from "@/lib/client/loadQuadrant";
import { computeVolumeLoad } from "@/lib/client/volumeLoad";
import { computePersonalRecords } from "@/lib/client/personalRecords";

export const runtime = "nodejs";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function admin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}
function iso(n: number): string { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

export async function GET(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: pRow } = await sb.from("players").select("id").eq("user_id", u.user.id).maybeSingle();
  if (!pRow) return NextResponse.json({ error: "Not a player account" }, { status: 403 });
  const playerId = (pRow as { id: string }).id;
  const lang = new URL(req.url).searchParams.get("lang") === "EN" ? "EN" : "IS";

  // ── Gather real signals ───────────────────────────────────────────
  const [{ data: checks }, quad, vol, prs] = await Promise.all([
    sb.from("readiness_entries").select("entry_date, total_score").eq("player_id", playerId)
      .gte("entry_date", iso(13)).order("entry_date", { ascending: false }),
    computeLoadQuadrant(sb, playerId),
    computeVolumeLoad(sb, playerId),
    computePersonalRecords(sb, playerId),
  ]);

  const scores = ((checks ?? []) as Array<{ total_score: number | null }>).map((c) => c.total_score).filter((x): x is number => x != null);
  const signals: string[] = [];
  if (scores.length >= 3) {
    const trend = scores[0] - scores[scores.length - 1];
    signals.push(`Readiness ${trend >= 2 ? "trending up" : trend <= -2 ? "trending down" : "stable"} (latest ${scores[0]}/25)`);
  }
  if (quad.acwr != null) signals.push(`Load ratio (sRPE) ${quad.acwr} — zone ${quad.zone}`);
  if (vol.acwr != null) signals.push(`Tonnage ratio ${vol.acwr} (${vol.acwr_status})`);
  if (vol.delta_pct != null) signals.push(`Weekly volume ${vol.delta_pct >= 0 ? "+" : ""}${vol.delta_pct}% vs last week`);
  const freshPr = prs.recent_prs.find((p) => p.date >= iso(6));
  if (freshPr) signals.push(`New PB: ${freshPr.exercise} ${freshPr.e1rm} kg (+${freshPr.delta_kg})`);

  if (signals.length === 0) {
    return NextResponse.json({ ok: true, insight: null, signals: [] });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: true, insight: null, signals });

  const system =
    "You are MicroPulse AI Coach, a strength & conditioning assistant for a competitive ATHLETE (not a general-fitness user). " +
    "Given today's data signals, write ONE short, specific, motivating coaching message (max 2 sentences, ~30 words). " +
    "Be concrete and reference the athlete's actual trend. NEVER invent numbers that are not in the signals. " +
    "Frame everything around performance and readiness — never aesthetics, weight loss, or calories. No medical advice. " +
    `Write in ${lang === "IS" ? "Icelandic" : "English"}. Respond ONLY as JSON: {\"insight\": \"...\"}.`;
  const userMessage = `Today's signals:\n- ${signals.join("\n- ")}`;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 200, system, messages: [{ role: "user", content: userMessage }] }),
    });
    if (!res.ok) return NextResponse.json({ ok: true, insight: null, signals });
    const json = await res.json() as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    let insight: string | null = null;
    try { insight = String((JSON.parse(cleaned) as { insight?: string }).insight ?? "").trim() || null; }
    catch { insight = cleaned.slice(0, 240) || null; }
    return NextResponse.json({ ok: true, insight, signals, model: "ai" });
  } catch {
    return NextResponse.json({ ok: true, insight: null, signals });
  }
}

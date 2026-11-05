/**
 * POST /api/coach/scouting/play-diagrams/draft-coverage
 *
 * Drafts a short DEFENSIVE COVERAGE note for one opponent set play ("how WE guard this set" —
 * the Keflavík scouting-report "our coverage" column), from the play's name, type and shape.
 * The coach edits and owns it; rules/coach decide, the AI only drafts. Nothing is stored here.
 * DESCRIPTIVE scouting — never touches the readiness colour, load, or a decision.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { playTypeLabel, type PlayDiagram } from "@/lib/micropulse/basketballStats/playDiagram";

const AI_MODEL = "claude-sonnet-5";

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { supabase, teamId } as const;
}

/** A terse geometry hint so the model grounds the coverage in the drawn shape (not required). */
function shapeHint(d: PlayDiagram | null | undefined): string {
  if (!d) return "";
  const off = (d.players ?? []).filter((p) => p.team === "off").length;
  const kinds = [...new Set((d.arrows ?? []).map((a) => a.kind))];
  const handler = (d.players ?? []).find((p) => p.team === "off" && p.ball);
  return `${off} offensive players; ball-handler ${handler ? `near x${Math.round(handler.x)}/y${Math.round(handler.y)} (0–100, basket at the bottom)` : "unmarked"}; actions drawn: ${kinds.join(", ") || "none"}.`;
}

function buildSystem(lang: "EN" | "IS"): string {
  const isIS = lang === "IS";
  return `You are an assistant basketball coach drafting a DEFENSIVE COVERAGE note for ONE opponent set play, for a head coach's scouting report. Given the play's name, type and a terse shape summary, write a SHORT, concrete coverage: how the defence should guard THIS set — the on-ball screen coverage (ice / blue / hedge / show / switch / chase over or under / drop), what to take away, and one weak-side or help note. Write the way a coach writes on a whiteboard: 2–3 short sentences or a few clipped phrases. Use standard coverage vocabulary. ${isIS ? "Write in Icelandic, but coverage terms (ice, blue, hedge, show, switch, chase over/under, drop, tag, ice the wing) may stay in English." : "Write in English."} Do NOT invent player names, jersey numbers or stats. Output ONLY the coverage text — no preamble, no heading, no JSON, no markdown.`;
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const playType = body?.playType ? String(body.playType) : null;
  const diagram = (body?.diagram ?? null) as PlayDiagram | null;
  const lang: "EN" | "IS" = body?.lang === "IS" ? "IS" : "EN";
  if (!name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI unavailable (no API key configured)." }, { status: 503 });

  const ptLabel = playType ? playTypeLabel(playType, lang) : "n/a";
  const user = `Play name: ${name}\nPlay type: ${ptLabel}\nShape: ${shapeHint(diagram) || "n/a"}\n\nDraft the coverage.`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 400, thinking: { type: "disabled" }, system: buildSystem(lang), messages: [{ role: "user", content: user }] }),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "AI request failed." }, { status: 502 });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ ok: false, error: `AI draft failed (${res.status}). ${detail.slice(0, 200)}` }, { status: 502 });
  }
  const j = await res.json().catch(() => null) as { content?: Array<{ type?: string; text?: string }> } | null;
  const text = Array.isArray(j?.content) ? j!.content.filter((b) => b?.type === "text").map((b) => b.text ?? "").join(" ").trim() : "";
  if (!text) return NextResponse.json({ ok: false, error: "Empty AI response." }, { status: 502 });
  return NextResponse.json({ ok: true, coverage: text.slice(0, 1000) });
}

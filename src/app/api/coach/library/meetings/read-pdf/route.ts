export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/coach/library/meetings/read-pdf
 * Body: { pdf: base64 (no data: prefix), lang?: "EN"|"IS" }
 *
 * Reads a meeting PDF (agenda / notes / plan) with Claude and proposes title / type / agenda /
 * attendees / summary as an AI DRAFT to prefill the meeting form. Nothing is saved or stored here —
 * the coach confirms/edits. Descriptive; never a readiness signal.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { normalizeMeetingPdfRead, MEETING_TYPES } from "@/lib/micropulse/library/meetingPdfReadSchema";

const AI_MODEL = "claude-sonnet-5";
const MAX_PDF_BYTES = 12_000_000; // ~12 MB of base64

const SYSTEM = `You read a football coaching MEETING document (an agenda, notes, or a plan) and extract fields to prefill a meeting form. Return STRICT JSON only (no prose, no code fences):
{
  "title": string | null,                 // a concise meeting title
  "meetingType": ${MEETING_TYPES.map((t) => `"${t}"`).join(" | ")} | null,
  "agenda": string | null,                 // the agenda / topics, as short lines
  "attendees": string | null,              // named attendees if listed, else null
  "summary": string | null,                // 1-3 sentence summary of decisions/notes if present
  "confidence": "high" | "moderate" | "low"
}
Rules: extract only what the document actually contains — set null for anything not present, never invent names or decisions. Keep it concise. Output JSON only.`;

export async function POST(req: NextRequest) {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  if (!["COACH", "ADMIN", "STAFF"].includes(String((prof as { role?: string } | null)?.role ?? "").toUpperCase())) {
    return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { pdf?: unknown; lang?: unknown };
  const pdf = typeof body.pdf === "string" ? body.pdf : "";
  if (!pdf) return NextResponse.json({ ok: false, error: "No PDF supplied" }, { status: 400 });
  if (pdf.length > MAX_PDF_BYTES) return NextResponse.json({ ok: false, error: "PDF too large to read — use a smaller file" }, { status: 413 });
  const lang = body.lang === "IS" ? "IS" : "EN";

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "AI is not configured" }, { status: 503 });

  const content = [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } },
    { type: "text", text: `Extract the meeting fields per the schema. Write agenda/summary in ${lang}. JSON only.` },
  ];

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 1500, thinking: { type: "disabled" }, system: SYSTEM, messages: [{ role: "user", content }] }),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "AI request failed" }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ ok: false, error: `AI error (${res.status})` }, { status: 502 });

  let parsed: unknown;
  try {
    const j = await res.json();
    let text = String(j?.content?.[0]?.text ?? "");
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    const first = text.indexOf("{"), last = text.lastIndexOf("}");
    if (first === -1 || last === -1) return NextResponse.json({ ok: false, error: "AI returned no JSON" }, { status: 422 });
    parsed = JSON.parse(text.slice(first, last + 1));
  } catch {
    return NextResponse.json({ ok: false, error: "AI returned invalid JSON" }, { status: 422 });
  }

  return NextResponse.json({ ok: true, read: normalizeMeetingPdfRead(parsed), model: AI_MODEL });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/coach/library/meetings/read-pdf
 * Body: { media_id: string, lang?: "EN"|"IS" }
 *
 * Reads an ALREADY-UPLOADED meeting PDF (coach_media) with Claude and proposes title / type / agenda /
 * attendees / summary as an AI DRAFT to prefill the meeting form. The server downloads the object from
 * the private bucket (so only a small media_id crosses the request — no multi-MB body / Vercel limit).
 * Nothing is saved by the read; the coach confirms/edits. Descriptive; never a readiness signal.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { normalizeMeetingPdfRead, MEETING_TYPES } from "@/lib/micropulse/library/meetingPdfReadSchema";
import { COACH_LIBRARY_BUCKET } from "@/lib/micropulse/library/media";

const AI_MODEL = "claude-sonnet-5";
const MAX_PDF_BYTES = 28_000_000; // Claude document limit is ~32 MB; stay just under

const SYSTEM = `You read a football coaching MEETING document (an agenda, notes, or a plan) and extract fields to prefill a meeting form. Return STRICT JSON only (no prose, no code fences):
{
  "title": string | null,
  "meetingType": ${MEETING_TYPES.map((t) => `"${t}"`).join(" | ")} | null,
  "agenda": string | null,
  "attendees": string | null,
  "summary": string | null,
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
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", uid).maybeSingle();
  const pr = (prof ?? {}) as { role?: string; team_id?: string | null };
  const role = String(pr.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { media_id?: unknown; text?: unknown; lang?: unknown };
  const mediaId = typeof body.media_id === "string" ? body.media_id : "";
  const clientText = typeof body.text === "string" ? body.text.trim().slice(0, 60_000) : "";
  if (!mediaId && clientText.length < 30) return NextResponse.json({ ok: false, error: "media_id or text required" }, { status: 400 });
  const lang = body.lang === "IS" ? "IS" : "EN";

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "AI is not configured" }, { status: 503 });

  const instruction = `Extract the meeting fields per the schema. Write agenda/summary in ${lang}. JSON only.`;
  let content: Array<Record<string, unknown>>;

  if (clientText) {
    // READ-ONLY path: text was extracted in the browser (no upload, no storage). Just read it.
    content = [{ type: "text", text: `${instruction}\n\nDocument text:\n\n${clientText}` }];
  } else {
    // Stored path: read an already-uploaded meeting PDF (media_id) from the private bucket.
    const { data: m } = await sb.from("coach_media").select("owner_type, owner_coach_id, team_id, storage_path, kind").eq("id", mediaId).maybeSingle();
    const media = m as { owner_type: string; owner_coach_id: string | null; team_id: string | null; storage_path: string | null; kind: string } | null;
    if (!media?.storage_path) return NextResponse.json({ ok: false, error: "Media not found" }, { status: 404 });
    let allowed = role === "ADMIN";
    if (!allowed && media.owner_type === "coach") allowed = media.owner_coach_id === uid;
    if (!allowed && media.owner_type === "team" && media.team_id) {
      if (pr.team_id === media.team_id) allowed = true;
      else { const { data: ct } = await sb.from("coach_teams").select("team_id").eq("coach_id", uid).eq("team_id", media.team_id).maybeSingle(); allowed = !!ct; }
    }
    if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const { data: blob, error: dlErr } = await sb.storage.from(COACH_LIBRARY_BUCKET).download(media.storage_path);
    if (dlErr || !blob) return NextResponse.json({ ok: false, error: "Could not read the file" }, { status: 502 });
    const buf = Buffer.from(await blob.arrayBuffer());

    // Small enough → full document block (best fidelity). Too big → extract the text layer server-side.
    if (buf.byteLength <= MAX_PDF_BYTES) {
      content = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
        { type: "text", text: instruction },
      ];
    } else {
      let text = "";
      try {
        const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text?: string }>;
        text = String((await pdfParse(buf)).text ?? "").trim().slice(0, 60_000);
      } catch { text = ""; }
      if (text.length < 200) return NextResponse.json({ ok: false, error: "PDF is too large for full read and has no extractable text (looks scanned/image-based) — use a smaller file or type the details in." }, { status: 413 });
      content = [{ type: "text", text: `${instruction}\n\nThe document is large; here is its extracted text:\n\n${text}` }];
    }
  }

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

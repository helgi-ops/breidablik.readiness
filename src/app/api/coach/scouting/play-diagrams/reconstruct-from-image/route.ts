/**
 * POST /api/coach/scouting/play-diagrams/reconstruct-from-image
 *
 * Reconstructs a (multi-phase) set-play diagram from uploaded CLEAN play images — e.g. a coaching
 * "Diagram A/B/C" sequence. Unlike the clip matcher (which only RECOGNISES a known set, because
 * positions from one broadcast angle are unreliable), a clean hand-drawn/printed diagram has explicit
 * positions and arrows, so vision can reconstruct editable JSON the coach then fixes. One image = one
 * phase; images are ordered. Nothing is stored here — the client saves the result as an editable AI draft.
 * DESCRIPTIVE scouting — never touches the readiness colour, load, or a decision.
 */
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { sanitizePlayDiagram, PLAY_TYPES, type PlayDiagram } from "@/lib/micropulse/basketballStats/playDiagram";

const AI_MODEL = "claude-sonnet-5";
const MAX_IMAGES = 6;
const MAX_PAYLOAD_BYTES = 3_500_000; // stay clear of Vercel's ~4.5 MB request-body cap

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

/** Parse a `data:image/xxx;base64,....` URL into an Anthropic image block; null if unusable. */
function toImageBlock(src: unknown): { type: "image"; source: { type: "base64"; media_type: string; data: string } } | null {
  if (typeof src !== "string") return null;
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(src.trim());
  if (!m) return null;
  const media = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
  return { type: "image", source: { type: "base64", media_type: media, data: m[2] } };
}

function buildSystem(lang: "EN" | "IS"): string {
  const isIS = lang === "IS";
  return `You convert basketball PLAY DIAGRAM images into structured JSON for a coach's scouting app. Each image is one clean half-court diagram (a phase of a set play); images are in order (phase A, B, C …). Reconstruct each diagram as faithfully as you can.

COORDINATE SYSTEM (match it exactly): x 0 = left sideline, 100 = right sideline. y 0 = the baseline behind the basket (TOP of the image), the rim is near x50 y10, the free-throw line ~y33, the three-point arc tops out around y48, and the half-court line is y94 (BOTTOM). So players near the basket or in the corners have LOW y; the point guard up top near half-court has HIGH y (~60–70). Read the drawing in this same orientation (basket at the top).

For EACH image output one phase object:
- players: array of { team: "off" | "def", x, y, ball, label }. "off" = offense (usually numbered circles 1–5), "def" = defender (X). Set ball:true on the ONE offensive player who has the ball in that phase (a ball symbol / the dribble arrow origin). label = the jersey/position number shown (e.g. "1".."5"), or "" for a defender. Only include defenders if the diagram clearly draws them.
- arrows: array of { from:[x,y], to:[x,y], kind }. kind = "dribble" (wavy/dribble line), "pass" (dashed straight line), "screen" (line ending in a bar/T — a screen/pick), "move" (a plain cut/run, solid arrow). Map each drawn line to the closest kind.

Also infer: name (the play's name if written on the image, else a short descriptive name), and playType — one of: ${PLAY_TYPES.map((p) => p.key).join(", ")}.

Return ONLY JSON, no prose, no markdown:
{"name": string, "playType": string, "phases": [ { "players": [...], "arrows": [...] }, ... ], "confidence": "high"|"medium"|"low", "note": string }
"note": one short sentence on anything ambiguous you had to guess. ${isIS ? "Write name/note in Icelandic." : "Write name/note in English."} Do NOT invent players, numbers or actions the diagram does not show.`;
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const lang: "EN" | "IS" = body?.lang === "IS" ? "IS" : "EN";
  const rawImages: unknown[] = Array.isArray(body?.images) ? body.images : [];
  if (!rawImages.length) return NextResponse.json({ ok: false, error: "No images were provided." }, { status: 400 });
  if (rawImages.length > MAX_IMAGES) return NextResponse.json({ ok: false, error: `Too many images (max ${MAX_IMAGES}).` }, { status: 400 });
  const blocks = rawImages.map(toImageBlock).filter((b): b is NonNullable<ReturnType<typeof toImageBlock>> => b != null);
  if (!blocks.length) return NextResponse.json({ ok: false, error: "The images were not readable (use PNG/JPEG/WebP)." }, { status: 400 });
  const bytes = blocks.reduce((s, b) => s + b.source.data.length, 0);
  if (bytes > MAX_PAYLOAD_BYTES) return NextResponse.json({ ok: false, error: "The images are too large — use fewer or smaller files." }, { status: 413 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI unavailable (no API key configured)." }, { status: 503 });

  const content: Array<Record<string, unknown>> = [
    ...blocks,
    { type: "text", text: `${blocks.length} play-diagram image(s), in order (phase A, B, C …). Reconstruct each as a phase per the schema. JSON only.` },
  ];

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 3000, thinking: { type: "disabled" }, system: buildSystem(lang), messages: [{ role: "user", content }] }),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "AI request failed." }, { status: 502 });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ ok: false, error: `AI reconstruction failed (${res.status}). ${detail.slice(0, 200)}` }, { status: 502 });
  }
  const j = await res.json().catch(() => null) as { content?: Array<{ type?: string; text?: string }> } | null;
  const text = Array.isArray(j?.content) ? j!.content.filter((b) => b?.type === "text").map((b) => b.text ?? "").join("") : "";
  const jsonStr = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let parsed: { name?: unknown; playType?: unknown; phases?: unknown; confidence?: unknown; note?: unknown };
  try { parsed = JSON.parse(jsonStr); } catch { return NextResponse.json({ ok: false, error: "The AI response was not valid JSON." }, { status: 502 }); }

  const rawPhases = Array.isArray(parsed.phases) ? parsed.phases : [];
  const phases: PlayDiagram[] = rawPhases.slice(0, MAX_IMAGES).map((p) => sanitizePlayDiagram(p)).filter((d) => d.players.length > 0);
  if (!phases.length) return NextResponse.json({ ok: false, error: "No players could be read from the image(s)." }, { status: 422 });
  const validTypes = new Set(PLAY_TYPES.map((p) => p.key));
  const playType = typeof parsed.playType === "string" && validTypes.has(parsed.playType) ? parsed.playType : "other";
  const name = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim().slice(0, 80) : (lang === "IS" ? "Kerfi úr mynd" : "Play from image");
  const confidence = parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low" ? parsed.confidence : "low";
  const note = typeof parsed.note === "string" ? parsed.note.slice(0, 300) : "";

  return NextResponse.json({ ok: true, name, playType, phases, confidence, note });
}

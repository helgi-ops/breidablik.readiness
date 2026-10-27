export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // Claude vision over several frames is slower than a text summary.

/**
 * /api/coach/scouting/play-diagrams/draft-from-frames
 *   POST { opponent, name?, frames[], durationSec?, lang }
 *        → send the browser-sampled clip frames to Claude vision, which returns a FIRST-DRAFT
 *          set-play diagram (positions + arrows in the shared schema). Persist it as an
 *          AI draft (source='ai_draft', confirmed=false) for the coach to edit and confirm.
 *
 * Phase 2 of set-play diagrams. The raw video NEVER reaches the server — the browser decodes
 * the clip and samples ≤12 downscaled JPEG frames (src/lib/video/extractFilmFrames.ts); only
 * those frames are posted here (Vercel has no ffmpeg and a ~4.5 MB body cap). The frames are
 * not stored — only the resulting diagram JSON is.
 *
 * Assistive first-draft ONLY, not automated play recognition: one broadcast angle yields a
 * rough read, so drafts start unconfirmed at low/medium confidence and cannot print until the
 * coach confirms (that is logged as confirmed_by). DESCRIPTIVE scouting — it never reads or
 * writes the readiness colour, load, or a training action.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { PLAY_TYPES, ARROW_KINDS, PLAY_VIEW, type PlayDiagram, type PlayArrow, type PlayPlayer, type ArrowKind } from "@/lib/micropulse/basketballStats/playDiagram";

const foldName = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

const AI_MODEL = "claude-sonnet-5";
const MAX_FRAMES = 12;
const MAX_PAYLOAD_BYTES = 3_500_000; // stay clear of Vercel's ~4.5 MB request-body cap
const MAX_PLAYERS = 10;
const MAX_ARROWS = 14;
const PLAY_TYPE_KEYS = new Set<string>(PLAY_TYPES.map((p) => p.key));
const ARROW_KIND_KEYS = new Set<string>(ARROW_KINDS.map((k) => k.key));

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
  return { supabase, teamId, userId: userRes.user.id } as const;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export type DraftResult = { name: string; playType: string | null; confidence: "high" | "medium" | "low"; diagram: PlayDiagram; note: string | null };

/**
 * Turn the model's loose JSON into a valid, bounded diagram. Pure + exported so it can be unit
 * tested. Clamps coordinates to the half court (0–100 × 0–94), drops malformed players/arrows,
 * validates the play-type / arrow-kind vocabularies, and caps counts. Never throws.
 */
export function sanitizeDraftDiagram(raw: unknown, fallbackName: string): DraftResult {
  const o = (raw && typeof raw === "object" ? raw as Record<string, unknown> : {}) as Record<string, unknown>;
  const name = (typeof o.name === "string" && o.name.trim()) ? o.name.trim().slice(0, 80) : fallbackName;
  const playType = typeof o.playType === "string" && PLAY_TYPE_KEYS.has(o.playType) ? o.playType : null;
  const conf = String(o.confidence ?? "").toLowerCase();
  const confidence: DraftResult["confidence"] = conf === "high" ? "high" : conf === "medium" ? "medium" : "low";
  const note = typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 600) : null;

  const dIn = (o.diagram && typeof o.diagram === "object" ? o.diagram as Record<string, unknown> : {}) as Record<string, unknown>;
  const playersIn = Array.isArray(dIn.players) ? dIn.players : [];
  const arrowsIn = Array.isArray(dIn.arrows) ? dIn.arrows : [];

  const players: PlayPlayer[] = [];
  let offN = 0, defN = 0;
  for (const p of playersIn) {
    if (!p || typeof p !== "object") continue;
    const pp = p as Record<string, unknown>;
    const x = num(pp.x), y = num(pp.y);
    if (x == null || y == null) continue;
    const team = pp.team === "def" ? "def" : "off";
    if (team === "off") offN++; else defN++;
    const n = team === "off" ? offN : defN;
    const ball = pp.ball === true;
    const label = typeof pp.label === "string" ? pp.label.slice(0, 3) : (team === "off" ? String(n) : "");
    players.push({ id: `${team === "off" ? "o" : "x"}${n}-${Date.now()}-${players.length}`, team, x: clamp(x, 2, PLAY_VIEW.w - 2), y: clamp(y, 2, PLAY_VIEW.h - 2), ball, label });
    if (players.length >= MAX_PLAYERS) break;
  }
  // Exactly one ball-handler: keep the first flagged offensive player, clear the rest.
  let ballSeen = false;
  for (const p of players) {
    if (p.team === "off" && p.ball) { if (ballSeen) p.ball = false; else ballSeen = true; }
  }

  const arrows: PlayArrow[] = [];
  for (const a of arrowsIn) {
    if (!a || typeof a !== "object") continue;
    const aa = a as Record<string, unknown>;
    const from = Array.isArray(aa.from) ? aa.from : null;
    const to = Array.isArray(aa.to) ? aa.to : null;
    if (!from || !to) continue;
    const fx = num(from[0]), fy = num(from[1]), tx = num(to[0]), ty = num(to[1]);
    if (fx == null || fy == null || tx == null || ty == null) continue;
    const kind: ArrowKind = ARROW_KIND_KEYS.has(aa.kind as string) ? (aa.kind as ArrowKind) : "move";
    arrows.push({
      from: [clamp(fx, 0, PLAY_VIEW.w), clamp(fy, 0, PLAY_VIEW.h)],
      to: [clamp(tx, 0, PLAY_VIEW.w), clamp(ty, 0, PLAY_VIEW.h)],
      kind,
    });
    if (arrows.length >= MAX_ARROWS) break;
  }

  return { name, playType, confidence, diagram: { court: "half", players, arrows }, note };
}

const AI_SYSTEM = `You are a basketball assistant drafting a SET-PLAY DIAGRAM for a head coach from a SHORT clip. You are given a handful of still frames sampled evenly (in order) from one offensive possession (typically 5-30 seconds). Read ACROSS the frames to infer the set, then output positions and movement as a half-court diagram.

COORDINATES — a half court, normalised:
- x: 0 = left sideline, 100 = right sideline.
- y: 0 = half-court line (top of the frame), 94 = baseline. The BASKET is at about x=50, y=84.
- Place each offensive player where the set STARTS (the formation), and use arrows for the movement that follows.

Output a diagram in this EXACT schema:
- players: array of { team: "off" | "def", x: number, y: number, ball?: boolean, label?: string }
  - "off" = the team WITH the ball (you are diagramming the offense). Up to 5 offensive players.
  - Optional "def" players only if a defensive action (a specific coverage) matters to the set.
  - Set ball:true on exactly ONE offensive player — the initial ball-handler.
  - label: the jersey number if legible, else "" (never invent a name).
- arrows: array of { from: [x, y], to: [x, y], kind: "move" | "dribble" | "screen" | "pass" }
  - move = a cut/relocation off the ball; dribble = the ball-handler dribbling; screen = a player setting a screen (draw it to the screen spot); pass = a pass between players.

Also return:
- name: a short English name for the set (e.g. "Spread ball-screen, right drive").
- playType: ONE of exactly: ${PLAY_TYPES.map((p) => p.key).join(", ")} (the closest match, or "other").
- confidence: "high" | "medium" | "low". These are SAMPLED STILLS of one broadcast angle, so be honest — usually "low", "medium" only if the set is unambiguous.
- note: one sentence on what you could and could not tell from the frames.

Hard rules:
- Describe ONLY what the frames support. If the set is unclear, draw your best rough read, say so in note, and set confidence "low". Never invent players or movement you cannot see.
- This is an assistive FIRST DRAFT the coach will correct — not ground truth.
- DESCRIPTIVE scouting only. No readiness, load, or training-prescription content.
- Return ONLY a JSON object (no markdown fence), with keys: name, playType, confidence, note, diagram.`;

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const opponent = String(body?.opponent ?? "").trim();
  if (!opponent) return NextResponse.json({ ok: false, error: "opponent is required" }, { status: 400 });
  const fallbackName = String(body?.name ?? "").trim() || (String(body?.lang ?? "EN").toUpperCase() === "IS" ? "Leikkerfi úr myndbandi" : "Set play from clip");
  const durationSec = Number.isFinite(Number(body?.durationSec)) ? Math.round(Number(body.durationSec)) : null;
  const lang = String(body?.lang ?? "EN").toUpperCase() === "IS" ? "Icelandic" : "English";
  const frames: unknown = body?.frames;

  if (!Array.isArray(frames) || frames.length === 0) return NextResponse.json({ ok: false, error: "No frames were provided." }, { status: 400 });
  if (frames.length > MAX_FRAMES) return NextResponse.json({ ok: false, error: `Too many frames (max ${MAX_FRAMES}).` }, { status: 400 });
  const clean = frames.map((f) => String(f ?? "")).filter((f) => f.length > 0);
  if (clean.length === 0) return NextResponse.json({ ok: false, error: "The frames were empty." }, { status: 400 });
  if (clean.reduce((n, f) => n + f.length, 0) > MAX_PAYLOAD_BYTES) return NextResponse.json({ ok: false, error: "The clip's frames are too large — use a shorter clip or fewer frames." }, { status: 413 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI drafting unavailable (no API key configured)." }, { status: 503 });

  const content: Array<Record<string, unknown>> = [
    ...clean.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
    { type: "text", text: `These are ${clean.length} frames sampled evenly (in order) from a ~${durationSec ?? "short"}s basketball clip of one offensive possession. Draft the set-play diagram per the schema. The set name and note must be written in ${lang}. JSON only.` },
  ];

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: 2000, thinking: { type: "disabled" }, system: AI_SYSTEM, messages: [{ role: "user", content }] }),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "AI request failed." }, { status: 502 });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ ok: false, error: `AI drafting failed (${res.status}). ${detail.slice(0, 200)}` }, { status: 502 });
  }

  const j = await res.json();
  let text = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  text = a >= 0 && b > a ? text.slice(a, b + 1) : text;
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  if (!parsed) return NextResponse.json({ ok: false, error: "The model didn't return a readable diagram — try again or draw it by hand." }, { status: 422 });

  const draft = sanitizeDraftDiagram(parsed, fallbackName);
  if (draft.diagram.players.length === 0) return NextResponse.json({ ok: false, error: "Couldn't read any players from this clip — try a clearer possession or draw it by hand." }, { status: 422 });

  const SELECT = "id, opponent_key, name, play_type, diagram, source, confidence, confirmed, confirmed_by, notes, created_at, updated_at";
  const { data: inserted, error: insErr } = await auth.supabase
    .from("opponent_play_diagrams")
    .insert({
      owner_team_id: auth.teamId,
      opponent_key: foldName(opponent),
      name: draft.name,
      play_type: draft.playType,
      diagram: draft.diagram,
      source: "ai_draft",
      confidence: draft.confidence,
      confirmed: false,
      confirmed_by: null,
      notes: draft.note,
    } as never)
    .select(SELECT)
    .maybeSingle();
  if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, diagram: inserted, model: AI_MODEL });
}

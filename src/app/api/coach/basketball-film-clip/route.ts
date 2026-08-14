export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // Claude vision over up to 12 frames is slower than a single text summary.

/**
 * /api/coach/basketball-film-clip
 *   GET  ?opponent=…            → saved film-clip notes for this coach + opponent (newest first)
 *   POST { opponent?, clipLabel, side, frames[], durationSec, lang }
 *                               → send the browser-sampled frames to Claude vision, store the note
 *
 * The raw video never reaches this route (Vercel body/time limits + no ffmpeg). The browser
 * decodes the clip and samples ≤12 downscaled JPEG frames (see src/lib/video/extractFilmFrames.ts);
 * here we hand those frames to claude-sonnet-5 vision and persist a structured, AI-labelled
 * "film note". DESCRIPTIVE scouting only — it never touches the readiness colour, load, or the
 * daily decision. Coach/team-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

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

const AI_MODEL = "claude-sonnet-5";
const MAX_FRAMES = 12;
const MAX_PAYLOAD_BYTES = 3_500_000; // stay clear of Vercel's ~4.5 MB request-body cap

const AI_SYSTEM = `You are a basketball film analyst helping a head coach scout from a SHORT clip. You are given a handful of still frames sampled evenly from one possession or set (typically 5-30 seconds). Describe, as concretely as the frames allow, what is happening on the floor.

Read across the frames in order (they are chronological) and infer:
- the OFFENSIVE action / set (pick-and-roll, horns, floppy, iso, post-up, dribble hand-off, spot-up, transition, etc.) — name it only if the frames support it,
- ball-screen usage and how the defense covers it (switch, drop, hedge/blitz, ice, over/under),
- spacing and off-ball movement (cuts, screens away, relocations),
- the DEFENSIVE scheme (man-to-man, zone 2-3/3-2/1-3-1, press, help/rotations),
- which players are involved (by jersey number/colour only — you cannot know rostered names),
- what the offense/defense is doing well or poorly on this possession.

Hard rules:
- These are SAMPLED STILL FRAMES of a short clip, NOT full video or player tracking. Say so in confidenceNote and never overclaim continuous motion you can't see.
- Describe ONLY what is visible. If something is unclear, say "unclear" or omit it — never invent players, scores, sets or events.
- Refer to players by jersey number and/or shirt colour ("ball-handler #7, dark"), never by a made-up name.
- DESCRIPTIVE scouting, not a training prescription. No readiness/load talk.
- Write in the requested language ONLY.
- Return ONLY a JSON object (no markdown fence) with EXACTLY these keys:
  headline: string (one sentence — the single most useful takeaway from this clip),
  actionType: string (the primary offensive action, plain words; "unclear" if you can't tell),
  setName: string (a named set if identifiable, else ""),
  ballScreen: { used: boolean, coverage: string },
  offense: { spacing: string, movement: string, strengths: string[] },
  defense: { scheme: string, coverage: string, weaknessesExposed: string[] },
  keyPlayers: Array<{ label: string, note: string }> (up to 4; label = jersey/colour),
  summary: string (3-5 sentences tying the possession together),
  confidenceNote: string (one sentence on how sure you are, given it's sampled stills of a short clip).`;

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const opponent = String(new URL(req.url).searchParams.get("opponent") ?? "").trim();
  let q = auth.supabase
    .from("basketball_film_clip_notes")
    .select("id, opponent_name, clip_label, side, note, model, frame_count, duration_sec, thumb, created_at")
    .eq("owner_team_id", auth.teamId)
    .order("created_at", { ascending: false })
    .limit(50);
  q = opponent ? q.eq("opponent_name", opponent) : q.is("opponent_name", null);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, notes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const opponent = String(body?.opponent ?? "").trim() || null;
  const clipLabel = String(body?.clipLabel ?? "").trim() || (opponent ? `${opponent} clip` : "Film clip");
  const side = body?.side === "own" ? "own" : "opp";
  const durationSec = Number.isFinite(Number(body?.durationSec)) ? Math.round(Number(body.durationSec)) : null;
  const lang = String(body?.lang ?? "EN").toUpperCase() === "IS" ? "Icelandic" : "English";
  const frames: unknown = body?.frames;

  if (!Array.isArray(frames) || frames.length === 0) {
    return NextResponse.json({ ok: false, error: "No frames were provided." }, { status: 400 });
  }
  if (frames.length > MAX_FRAMES) {
    return NextResponse.json({ ok: false, error: `Too many frames (max ${MAX_FRAMES}).` }, { status: 400 });
  }
  const clean = frames.map((f) => String(f ?? "")).filter((f) => f.length > 0);
  if (clean.length === 0) {
    return NextResponse.json({ ok: false, error: "The frames were empty." }, { status: 400 });
  }
  const totalBytes = clean.reduce((n, f) => n + f.length, 0);
  if (totalBytes > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "The clip's frames are too large — use a shorter clip or fewer frames." }, { status: 413 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI film analysis unavailable (no API key configured)." }, { status: 503 });

  const content: Array<Record<string, unknown>> = [
    ...clean.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
    { type: "text", text: `These are ${clean.length} frames sampled evenly (in order) from a ~${durationSec ?? "short"}s basketball clip. Analyse the possession per the schema and write in ${lang}. JSON only.` },
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
    return NextResponse.json({ ok: false, error: `AI film analysis failed (${res.status}). ${detail.slice(0, 200)}` }, { status: 502 });
  }

  const j = await res.json();
  let text = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  text = a >= 0 && b > a ? text.slice(a, b + 1) : text;
  let note: Record<string, unknown> | null = null;
  try { note = JSON.parse(text); } catch { note = null; }
  if (!note) return NextResponse.json({ ok: false, error: "The model didn't return a readable film note — try again." }, { status: 422 });

  const thumb = clean[Math.floor(clean.length / 2)] ?? null;
  const { data: inserted, error: insErr } = await auth.supabase
    .from("basketball_film_clip_notes")
    .insert({
      owner_team_id: auth.teamId,
      opponent_name: opponent,
      clip_label: clipLabel,
      side,
      note,
      model: AI_MODEL,
      frame_count: clean.length,
      duration_sec: durationSec,
      thumb,
    })
    .select("id, opponent_name, clip_label, side, note, model, frame_count, duration_sec, thumb, created_at")
    .maybeSingle();
  if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, note: inserted, model: AI_MODEL });
}

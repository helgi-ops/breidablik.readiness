export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/coach/drill-library/video-read
 * Body: { frames: string[] (base64 JPEG, no data: prefix), durationSec?: number, lang?: "EN"|"IS" }
 *
 * Reads a football drill from sampled video frames → an AI DRAFT (name/category/format/phases/
 * description/estimates). Nothing is saved here — the coach reviews the draft and then POSTs to
 * /api/coach/drill-library to create the drill. Frames are processed in-request and never stored.
 * No physical metrics or player identities are produced (schema + prompt forbid). Never the colour.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { analyzeDrillVideo } from "@/lib/micropulse/drillLibrary/videoRead";

const MAX_FRAMES = 12;
const MAX_PAYLOAD_BYTES = 3_500_000;

export async function POST(req: NextRequest) {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  if (!["COACH", "ADMIN", "STAFF"].includes(String(p.role ?? "").toUpperCase())) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
  if (!p.team_id) return NextResponse.json({ ok: false, error: "No team context" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { frames?: unknown; durationSec?: unknown; lang?: unknown };
  const frames = Array.isArray(body.frames) ? body.frames.filter((f): f is string => typeof f === "string" && f.length > 0) : [];
  if (frames.length === 0) return NextResponse.json({ ok: false, error: "No frames supplied" }, { status: 400 });
  if (frames.length > MAX_FRAMES) return NextResponse.json({ ok: false, error: `Too many frames (max ${MAX_FRAMES})` }, { status: 400 });
  const bytes = frames.reduce((s, f) => s + f.length, 0);
  if (bytes > MAX_PAYLOAD_BYTES) return NextResponse.json({ ok: false, error: "Frames payload too large — use fewer / smaller frames" }, { status: 413 });

  const durationSec = typeof body.durationSec === "number" && Number.isFinite(body.durationSec) ? Math.round(body.durationSec) : null;
  const lang = body.lang === "IS" ? "IS" : "EN";

  const out = await analyzeDrillVideo(frames, durationSec, lang);
  if (!out.ok) return NextResponse.json({ ok: false, error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, read: out.read, model: out.model, frameCount: frames.length });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // Claude vision over many frames is slower than a text call.

/**
 * /api/coach/movement-analysis
 *   POST { tests: [{ label, frames: string[] }], lang }
 *     → hand the browser-sampled frames of each named movement test to Claude
 *       vision, grounded in the movement engine, and return a STRICT, server-
 *       normalized analysis (observations by region, patterns, suggestions,
 *       red flags, capture quality, a region to assess next + priority fields).
 *
 * The raw video/images never persist (Vercel body/time limits + privacy — like
 * the film-clip route). Screening / training only — never a diagnosis, never the
 * readiness colour. Coach/team-scoped.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { analyzeMovementVision, type MovementTestInput } from "@/lib/micropulse/movementScreen/vision/ai";

const MAX_FRAMES_TOTAL = 32;
const MAX_PAYLOAD_BYTES = 3_500_000; // stay clear of Vercel's ~4.5 MB request-body cap

async function authCoach(req: NextRequest) {
  const supabase = getSupabaseServer();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  return { ok: true } as const;
}

export async function POST(req: NextRequest) {
  const auth = await authCoach(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const lang = String((body as { lang?: string })?.lang ?? "EN").toUpperCase() === "IS" ? "IS" : "EN";
  const rawTests: unknown = (body as { tests?: unknown })?.tests;
  if (!Array.isArray(rawTests) || rawTests.length === 0) {
    return NextResponse.json({ ok: false, error: "No movement tests were provided." }, { status: 400 });
  }

  const tests: MovementTestInput[] = [];
  let frameCount = 0;
  let bytes = 0;
  for (const t of rawTests.slice(0, 6)) {
    const obj = (t ?? {}) as { label?: unknown; frames?: unknown };
    const label = String(obj.label ?? "").trim().slice(0, 120) || "Movement test";
    const frames = Array.isArray(obj.frames) ? obj.frames.map((f) => String(f ?? "")).filter((f) => f.length > 0) : [];
    if (!frames.length) continue;
    frameCount += frames.length;
    bytes += frames.reduce((n, f) => n + f.length, 0);
    tests.push({ label, frames });
  }
  if (!tests.length) return NextResponse.json({ ok: false, error: "The frames were empty." }, { status: 400 });
  if (frameCount > MAX_FRAMES_TOTAL) return NextResponse.json({ ok: false, error: `Too many frames (max ${MAX_FRAMES_TOTAL} across all tests).` }, { status: 400 });
  if (bytes > MAX_PAYLOAD_BYTES) return NextResponse.json({ ok: false, error: "The frames are too large — use shorter clips / fewer images." }, { status: 413 });

  const result = await analyzeMovementVision(tests, lang);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, analysis: result.analysis, model: result.model, frameCount });
}

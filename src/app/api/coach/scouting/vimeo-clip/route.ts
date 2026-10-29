export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/scouting/vimeo-clip
 *   POST { url } → reads that Vimeo clip's METADATA via the official API (title, duration, chapters,
 *   description). Text only — no video is downloaded/scraped and the footage is never interpreted. Lets
 *   the coach "read" a linked scouting clip so its chapter markers can pre-fill tagged clips.
 *
 * Descriptive scouting — never touches readiness. Coach/team-scoped; needs a Vimeo account token
 * (VIMEO_ACCESS_TOKEN on the server).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { parseVimeoRef, fetchVimeoClip, vimeoToken } from "@/lib/integrations/vimeo/client";

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
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
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const url = String(body?.url ?? "").trim();
  const ref = url ? parseVimeoRef(url) : null;
  if (!ref) return NextResponse.json({ ok: false, error: "Not a Vimeo link." }, { status: 400 });

  const token = vimeoToken();
  if (!token) return NextResponse.json({ ok: false, error: "Vimeo isn't connected (no API token configured)." }, { status: 503 });

  let clip;
  try { clip = await fetchVimeoClip(ref, token); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Vimeo request failed." }, { status: 502 }); }
  if (!clip) return NextResponse.json({ ok: false, error: "Couldn't read that clip — check the link and that the Vimeo token can access it." }, { status: 404 });

  return NextResponse.json({ ok: true, clip });
}

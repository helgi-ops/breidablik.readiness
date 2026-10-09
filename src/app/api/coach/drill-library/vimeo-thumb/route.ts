export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/coach/drill-library/vimeo-thumb?url=<vimeo url>
 *
 * Resolves a Vimeo video's poster image via Vimeo's public oEmbed endpoint (Vimeo, unlike YouTube,
 * has no static thumbnail URL derivable from the id). Returns { ok, thumbnail }. Used to show a real
 * thumbnail on a drill card whose video_url is a Vimeo link.
 *
 * SSRF-safe: only ever fetches the FIXED vimeo.com oEmbed host with the user's URL as a query param.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

function isVimeo(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return h === "vimeo.com" || h === "player.vimeo.com" || h.endsWith(".vimeo.com");
  } catch { return false; }
}

export async function GET(req: NextRequest) {
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

  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!url || !isVimeo(url)) return NextResponse.json({ ok: false, error: "Not a Vimeo URL" }, { status: 422 });

  try {
    const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}&width=640`, { headers: { accept: "application/json" } });
    if (!res.ok) return NextResponse.json({ ok: false, error: `oEmbed ${res.status}` }, { status: 502 });
    const j = (await res.json()) as Record<string, unknown>;
    const thumbnail = typeof j.thumbnail_url === "string" ? j.thumbnail_url : null;
    if (!thumbnail) return NextResponse.json({ ok: false, error: "No thumbnail" }, { status: 404 });
    return NextResponse.json({ ok: true, thumbnail }, { headers: { "cache-control": "private, max-age=86400" } });
  } catch {
    return NextResponse.json({ ok: false, error: "oEmbed failed" }, { status: 502 });
  }
}

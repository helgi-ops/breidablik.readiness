export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/coach/drill-library/link-read
 * Body: { url: string (YouTube/Vimeo), lang?: "EN"|"IS" }
 *
 * For a pasted video LINK the footage can't be frame-sampled (YouTube/Vimeo block cross-origin
 * canvas reads), so instead we read the video's OWN title/description via the provider's public
 * oEmbed endpoint and let the model draft a drill card FROM THAT TEXT (not the footage). An AI
 * DRAFT the coach confirms; no physical metrics / player identities (schema forbids). Never the colour.
 *
 * SSRF-safe: we only ever fetch the FIXED oEmbed hosts (youtube.com / vimeo.com) with the user's
 * URL as a query param — the user's URL itself is never fetched server-side.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { analyzeDrillLink } from "@/lib/micropulse/drillLibrary/videoRead";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";

/** Classify a pasted URL → oEmbed provider, or null when it isn't a supported host. */
function provider(url: string): "youtube" | "vimeo" | null {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return "youtube";
  if (host === "vimeo.com" || host === "player.vimeo.com" || host.endsWith(".vimeo.com")) return "vimeo";
  return null;
}

async function fetchOEmbed(prov: "youtube" | "vimeo", url: string): Promise<{ title?: string; description?: string; author?: string } | null> {
  const endpoint = prov === "youtube"
    ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
  try {
    const res = await fetch(endpoint, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    return {
      title: typeof j.title === "string" ? j.title : undefined,
      // Only Vimeo's oEmbed carries a description; YouTube's does not (title + author only).
      description: typeof j.description === "string" ? j.description : undefined,
      author: typeof j.author_name === "string" ? j.author_name : undefined,
    };
  } catch {
    return null;
  }
}

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

  const body = (await req.json().catch(() => ({}))) as { url?: unknown; lang?: unknown };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const lang = body.lang === "IS" ? "IS" : "EN";
  if (!url) return NextResponse.json({ ok: false, error: "No URL supplied" }, { status: 400 });
  const prov = provider(url);
  if (!prov) return NextResponse.json({ ok: false, error: "Only YouTube or Vimeo links can be read as text. For another host, upload the video file instead." }, { status: 422 });

  const meta = await fetchOEmbed(prov, url);
  if (!meta || (!meta.title && !meta.description)) {
    return NextResponse.json({ ok: false, error: "Could not read this video's title/description (it may be private or unavailable)." }, { status: 422 });
  }

  const sport = await resolveTeamSport(sb, p.team_id).catch(() => null);
  const out = await analyzeDrillLink({ ...meta, provider: prov }, lang, sport);
  if (!out.ok) return NextResponse.json({ ok: false, error: out.error }, { status: out.status });
  return NextResponse.json({ ok: true, read: out.read, model: out.model, provider: prov, source: "link_metadata" });
}

export const runtime = "nodejs";

/**
 * GET /api/player/exercise-videos
 *
 * Returns the global exercise demo-video catalog (name + Icelandic name + URL)
 * so the player's Today session can show a "▶ video" link beside each exercise.
 *
 * READ-ONLY and non-sensitive: these are coach-curated public demo links
 * (`exercise_library.video_url`) for the shared, global exercises
 * (`owner_team_id IS NULL`). The catalog is small (~130 rows) and stable, so the
 * client fetches it once and caches it. No readiness / decision data is touched.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export async function GET(req: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    // Any authenticated player may read the shared demo-video catalog.
    await requireAuthedPlayerId(sb, req);

    const { data, error } = await sb
      .from("exercise_library")
      .select("name, name_is, video_url")
      .is("owner_team_id", null)
      .not("video_url", "is", null);
    if (error) throw error;

    const videos = (data ?? [])
      .filter((r): r is { name: string; name_is: string | null; video_url: string } => Boolean(r.video_url))
      .map((r) => ({ name: r.name, name_is: r.name_is, video_url: r.video_url }));

    return NextResponse.json(
      { ok: true, videos },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load exercise videos";
    const status = /auth|token|player/i.test(msg) ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg, videos: [] }, { status });
  }
}

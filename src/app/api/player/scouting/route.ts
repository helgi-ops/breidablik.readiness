export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/player/scouting — the latest opponent scouting briefing the coach sent this player's team,
 * with the tagged clips joined live (uploaded clips re-signed for playback). Read-only, self-scoped by
 * the authenticated player. Informational — never the readiness colour, load, or a training action.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

const BUCKET = "scouting-clips";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try { ({ playerId } = await requireAuthedPlayerId(sb, req)); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 }); }

  const { data: p } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
  const teamId = (p?.team_id as string | null) ?? null;
  if (!teamId) return NextResponse.json({ ok: true, share: null });

  const { data: shareRow } = await sb.from("opponent_scout_shares")
    .select("opponent, opponent_key, title, snapshot, created_at")
    .eq("team_id", teamId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const share = shareRow as { opponent: string; opponent_key: string; title: string | null; snapshot: Record<string, unknown>; created_at: string } | null;
  if (!share) return NextResponse.json({ ok: true, share: null });

  // The tagged clips for this opponent, re-signed for playback, grouped by player.
  const { data: clipRows } = await sb.from("opponent_player_clips")
    .select("player_name, action, made, period, clock, video_url, storage_path, source")
    .eq("owner_team_id", teamId).eq("opponent_key", share.opponent_key).order("created_at", { ascending: false });
  type ClipRow = { player_name: string; action: string; made: boolean | null; period: string | null; clock: string | null; video_url: string | null; storage_path: string | null; source: string };
  const clips = (clipRows ?? []) as ClipRow[];
  const stored = clips.filter((c) => c.storage_path);
  if (stored.length) {
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrls(stored.map((c) => c.storage_path as string), 60 * 60 * 3);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const c of clips) if (c.storage_path) c.video_url = byPath.get(c.storage_path) ?? null;
  }
  const clipsByPlayer: Record<string, Array<{ action: string; made: boolean | null; period: string | null; clock: string | null; video_url: string | null; is_file: boolean }>> = {};
  for (const c of clips) (clipsByPlayer[c.player_name] ??= []).push({ action: c.action, made: c.made, period: c.period, clock: c.clock, video_url: c.video_url, is_file: !!c.storage_path });

  return NextResponse.json({ ok: true, share: { opponent: share.opponent, title: share.title, snapshot: share.snapshot, createdAt: share.created_at }, clipsByPlayer });
}

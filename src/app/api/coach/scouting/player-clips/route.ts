export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/scouting/player-clips — tagged scouting clips for an OPPONENT player.
 *
 * A clip is evidence: {player, action, timecode, deep-link}. No video is downloaded or re-hosted and
 * nothing is interpreted by the system (no play recognition) — the coach (or, later, the feed's
 * official event-tag API) supplies player + action + timecode. Team-scoped by owner_team_id; keyed by
 * foldName(opponent) + player_name, matching the scout report. Descriptive — never touches readiness.
 *
 *   GET    ?opponent=…&player=…  → that player's clips + a small aggregate (by action + shot points)
 *   POST   { opponent, player, action, made?, period?, clock?, videoUrl?, courtX?, courtY? } → add
 *   DELETE ?id=…                 → remove one clip (team-scoped)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

const foldName = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const ACTIONS = new Set(["3pt_make", "3pt_miss", "drive", "post_up", "oreb_putback", "assist", "turnover", "other"]);

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

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

type ClipRow = {
  id: string; player_name: string; action: string; made: boolean | null;
  court_x: number | null; court_y: number | null; period: string | null; clock: string | null;
  video_url: string | null; storage_path?: string | null; source: string; created_at: string;
};
const SCOUTING_BUCKET = "scouting-clips";

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const sp = new URL(req.url).searchParams;
  const opponent = (sp.get("opponent") ?? "").trim();
  const player = (sp.get("player") ?? "").trim();
  if (!opponent) return NextResponse.json({ ok: false, error: "opponent is required" }, { status: 400 });

  let q = auth.supabase.from("opponent_player_clips")
    .select("id, player_name, action, made, court_x, court_y, period, clock, video_url, storage_path, source, created_at")
    .eq("owner_team_id", auth.teamId).eq("opponent_key", foldName(opponent));
  if (player) q = q.eq("player_name", player);
  const { data } = await q.order("created_at", { ascending: false });
  const clips = (data ?? []) as ClipRow[];

  // Uploaded clips live in a PRIVATE bucket — hand the client a short-lived signed URL to play, and
  // flag it as a file so the UI uses a <video> tag (not an iframe embed).
  const stored = clips.filter((c) => c.storage_path);
  if (stored.length) {
    const { data: signed } = await auth.supabase.storage.from(SCOUTING_BUCKET).createSignedUrls(stored.map((c) => c.storage_path as string), 60 * 60 * 3);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const c of clips) if (c.storage_path) { c.video_url = byPath.get(c.storage_path) ?? null; (c as ClipRow & { is_file?: boolean }).is_file = true; }
  }

  // Aggregate by action (made/attempted) + shot-location points for the chart.
  const byActionMap = new Map<string, { made: number; attempts: number }>();
  const shotPoints: Array<{ x: number; y: number; made: boolean; action: string }> = [];
  for (const c of clips) {
    const a = byActionMap.get(c.action) ?? { made: 0, attempts: 0 };
    a.attempts += 1; if (c.made) a.made += 1; byActionMap.set(c.action, a);
    if (c.court_x != null && c.court_y != null) shotPoints.push({ x: c.court_x, y: c.court_y, made: !!c.made, action: c.action });
  }
  const byAction = [...byActionMap.entries()].map(([action, v]) => ({ action, ...v })).sort((x, y) => y.attempts - x.attempts);
  return NextResponse.json({ ok: true, opponent, player: player || null, clips, byAction, shotPoints, count: clips.length });
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const opponent = String(body?.opponent ?? "").trim();
  const player = String(body?.player ?? "").trim();
  const action = String(body?.action ?? "").trim();
  if (!opponent || !player) return NextResponse.json({ ok: false, error: "opponent and player are required" }, { status: 400 });
  if (!ACTIONS.has(action)) return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });

  const row = {
    owner_team_id: auth.teamId, opponent_key: foldName(opponent), player_name: player, action,
    made: typeof body?.made === "boolean" ? body.made : null,
    court_x: num(body?.courtX), court_y: num(body?.courtY),
    period: body?.period ? String(body.period).slice(0, 16) : null,
    clock: body?.clock ? String(body.clock).slice(0, 16) : null,
    video_url: body?.videoUrl ? String(body.videoUrl).slice(0, 2048) : null,
    source: String(body?.source ?? "coach") === "api" ? "api" : "coach",
  };
  const { data, error } = await auth.supabase.from("opponent_player_clips").insert(row as never).select("id").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: (data as { id?: string } | null)?.id ?? null });
}

export async function DELETE(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  // Remove the stored file too (if this clip was an upload), scoped to the team.
  const { data: row } = await auth.supabase.from("opponent_player_clips").select("storage_path").eq("owner_team_id", auth.teamId).eq("id", id).maybeSingle();
  const path = (row as { storage_path?: string | null } | null)?.storage_path ?? null;
  const { error } = await auth.supabase.from("opponent_player_clips").delete().eq("owner_team_id", auth.teamId).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (path) await auth.supabase.storage.from(SCOUTING_BUCKET).remove([path]).catch(() => {});
  return NextResponse.json({ ok: true });
}

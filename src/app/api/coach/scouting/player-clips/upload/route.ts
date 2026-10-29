export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/coach/scouting/player-clips/upload — multipart upload of a SHORT scouting clip (e.g. a
 * single InStat possession) into the PRIVATE scouting-clips bucket, then an opponent_player_clips row
 * pointing at the object. Played back via a short-lived signed URL (opponent-player video → private).
 *
 * Opt-in and size/duration-capped — uploads are the costly line; deep links stay the default.
 * Descriptive scouting — never touches readiness.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

const BUCKET = "scouting-clips";
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB — a short possession clip; link anything larger
const MAX_DURATION_S = 120;          // ~2 min cap for one scouting clip
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

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Expected multipart form" }, { status: 400 });
  const file = form.get("file");
  const opponent = String(form.get("opponent") ?? "").trim();
  const player = String(form.get("player") ?? "").trim();
  const action = String(form.get("action") ?? "").trim();
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
  if (!opponent || !player) return NextResponse.json({ ok: false, error: "opponent and player are required" }, { status: 400 });
  if (!ACTIONS.has(action)) return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  const type = file.type || "application/octet-stream";
  if (!type.startsWith("video/")) return NextResponse.json({ ok: false, error: "Only a video file (e.g. the InStat .mp4 download)" }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "Clip too large (max 100 MB) — trim it or paste a link instead" }, { status: 413 });
  const durationRaw = Number(form.get("duration_s"));
  const durationS = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : null;
  if (durationS != null && durationS > MAX_DURATION_S) {
    return NextResponse.json({ ok: false, error: `Clip too long (${Math.round(durationS)}s, max ${MAX_DURATION_S}s) — trim it or paste a link` }, { status: 413 });
  }

  const safeName = (file.name || "clip.mp4").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
  const path = `${auth.teamId}/${foldName(opponent)}/${crypto.randomUUID()}-${safeName}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await auth.supabase.storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: false });
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  const made = form.get("made");
  const row = {
    owner_team_id: auth.teamId, opponent_key: foldName(opponent), player_name: player, action,
    made: made === "true" ? true : made === "false" ? false : null,
    period: form.get("period") ? String(form.get("period")).slice(0, 16) : null,
    clock: form.get("clock") ? String(form.get("clock")).slice(0, 16) : null,
    video_url: null, storage_path: path, source: "coach",
  };
  const { data, error } = await auth.supabase.from("opponent_player_clips").insert(row as never).select("id").maybeSingle();
  if (error) {
    await auth.supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: (data as { id?: string } | null)?.id ?? null });
}

/**
 * GET  /api/coach/training-programme/[playerId]
 *   → the freshly computed MD-periodised microcycle for the player, plus any saved copy.
 * POST /api/coach/training-programme/[playerId]   body { weekStart, days, overrides? }
 *   → persist the (possibly coach-edited) week to player_training_programmes.
 *
 * Team-scoped (requireCoachAccessForTeam). Heavy compute lives in
 * loadMicrocycleProgramme so the coach page and the player view can't drift.
 * DESCRIPTIVE — the day colour is a PLANNED-load band; nothing here reads/writes
 * the readiness verdict colour beyond easing a day (read-only).
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { loadMicrocycleProgramme } from "@/lib/micropulse/microcycleProgramme/loader";

export const runtime = "nodejs";

function todayInReykjavik(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());
}

async function resolve(req: Request, playerId: string) {
  const sb = getSupabaseAdmin();
  const { data: pl } = await sb.from("players").select("id, team_id, full_name").eq("id", playerId).maybeSingle();
  const player = pl as { id: string; team_id: string | null; full_name: string | null } | null;
  if (!player?.team_id) throw new Error("Player not found");
  const { teamId } = await requireCoachAccessForTeam(sb, req, player.team_id);
  if (teamId !== player.team_id) throw new Error("Forbidden");
  return { sb, player, teamId: player.team_id };
}

function status(msg: string): number {
  return /forbidden/i.test(msg) ? 403 : /not found/i.test(msg) ? 404 : /unauth|token|auth/i.test(msg) ? 401 : 400;
}

export async function GET(req: Request, { params }: { params: Promise<{ playerId: string }> }) {
  try {
    const { playerId } = await params;
    const { sb, player, teamId } = await resolve(req, playerId);
    const todayIso = todayInReykjavik();

    const programme = await loadMicrocycleProgramme(sb, {
      playerId, playerName: player.full_name ?? undefined, teamId, todayIso,
    });
    const weekStart = programme?.weekStart ?? todayIso;
    const { data: savedRow } = await sb
      .from("player_training_programmes").select("days, overrides, generated_at, updated_at, week_start")
      .eq("player_id", playerId).eq("week_start", weekStart).maybeSingle();

    return NextResponse.json({ ok: true, programme, saved: savedRow ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: status(msg) });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ playerId: string }> }) {
  try {
    const { playerId } = await params;
    const { sb, teamId } = await resolve(req, playerId);
    const body = (await req.json().catch(() => ({}))) as {
      weekStart?: string; days?: unknown; overrides?: unknown;
    };
    if (!body.weekStart || !Array.isArray(body.days)) {
      return NextResponse.json({ ok: false, error: "weekStart and days[] required" }, { status: 400 });
    }
    const { error } = await sb.from("player_training_programmes").upsert(
      {
        player_id: playerId, team_id: teamId, week_start: body.weekStart,
        days: body.days, overrides: Array.isArray(body.overrides) ? body.overrides : [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id,week_start" },
    );
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: status(msg) });
  }
}

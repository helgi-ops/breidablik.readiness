/**
 * POST /api/coach/estimate-pod   — one-tap "forgot pod?" estimate for a player.
 * DELETE /api/coach/estimate-pod — remove an estimate (real rows untouched).
 *
 * Body: { teamId, playerId, matchDate, minutes }
 *
 * The estimate = the player's own real match average, pro-rated by minutes
 * (peaks as-is), with a squad-average fallback per column. Written to
 * player_external_load_daily with source='catapult' and
 * raw_payload_json.estimated=true, so a later real Catapult sync overwrites it.
 * Auth: caller must be a coach of teamId (requireCoachAccessForTeam). Estimated
 * rows never feed baselines/PRs (callers filter raw_payload_json->>'estimated').
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { buildEstimateRow, ESTIMATE_COLS, type LoadRowLike } from "@/lib/micropulse/estimatePod";

export const runtime = "nodejs";

const SELECT_COLS = ["player_id", "date", "total_distance", "ima_total", "raw_payload_json", ...ESTIMATE_COLS].join(", ");
const isEstimated = (r: LoadRowLike) =>
  !!(r.raw_payload_json as { estimated?: boolean } | null)?.estimated;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const rowsOf = (data: unknown): LoadRowLike[] => (Array.isArray(data) ? (data as unknown as LoadRowLike[]) : []);

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const body = (await req.json().catch(() => ({}))) as { teamId?: string; playerId?: string; matchDate?: string; minutes?: number };
    const playerId = String(body.playerId ?? "");
    const matchDate = String(body.matchDate ?? "");
    const minutes = Number(body.minutes);

    if (!playerId || !/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) {
      return NextResponse.json({ error: "playerId and matchDate (YYYY-MM-DD) are required" }, { status: 400 });
    }
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 130) {
      return NextResponse.json({ error: "minutes must be between 1 and 130" }, { status: 400 });
    }

    const { coachUserId, teamId } = await requireCoachAccessForTeam(sb, req, body.teamId ?? null);
    if (!teamId) return NextResponse.json({ error: "Team context is required" }, { status: 400 });

    // The player must belong to this team.
    const { data: player } = await sb.from("players").select("id").eq("id", playerId).eq("team_id", teamId).maybeSingle();
    if (!player) return NextResponse.json({ error: "Player not on this team" }, { status: 404 });

    // Don't overwrite a REAL catapult row — only estimate when there's nothing (or a prior estimate).
    const { data: existing } = await sb
      .from("player_external_load_daily")
      .select("raw_payload_json")
      .eq("player_id", playerId).eq("date", matchDate).eq("source", "catapult")
      .maybeSingle();
    if (existing && !isEstimated(existing as unknown as LoadRowLike)) {
      return NextResponse.json({ error: "Player already has real pod data for this match" }, { status: 409 });
    }

    // Personal baseline: the player's real match rows. Prefer team match dates;
    // fall back to full-match-sized sessions (>7000 m) if he has fewer than 3.
    const { data: schedRows } = await sb.from("match_schedule").select("match_date").eq("team_id", teamId);
    const matchDates = ((schedRows ?? []) as Array<{ match_date: string }>).map((r) => r.match_date);

    let personalRows: LoadRowLike[] = [];
    if (matchDates.length) {
      const { data } = await sb.from("player_external_load_daily").select(SELECT_COLS)
        .eq("player_id", playerId).eq("source", "catapult").in("date", matchDates);
      personalRows = rowsOf(data).filter((r) => !isEstimated(r) && r.date !== matchDate);
    }
    if (personalRows.length < 3) {
      const { data } = await sb.from("player_external_load_daily").select(SELECT_COLS)
        .eq("player_id", playerId).eq("source", "catapult").gt("total_distance", 7000);
      const proxy = rowsOf(data).filter((r) => !isEstimated(r) && r.date !== matchDate);
      if (proxy.length > personalRows.length) personalRows = proxy;
    }

    // Squad fallback: pod-wearers on THIS match date (real rows with data).
    const { data: squadRaw } = await sb.from("player_external_load_daily").select(SELECT_COLS)
      .eq("team_id", teamId).eq("date", matchDate).eq("source", "catapult");
    const squadRows = rowsOf(squadRaw).filter(
      (r) => !isEstimated(r) && r.player_id !== playerId && (num(r.total_distance) > 0 || num(r.ima_total) > 0),
    );

    if (personalRows.length === 0 && squadRows.length === 0) {
      return NextResponse.json({ error: "Nothing to estimate from — needs match history for this player or at least one pod on this match" }, { status: 422 });
    }

    const { row, baselineUsed, nPersonal, nSquad } = buildEstimateRow({ personalRows, squadRows, minutes, teamId, playerId, matchDate, coachUserId });
    row.updated_at = new Date().toISOString();

    const { error: upErr } = await sb.from("player_external_load_daily").upsert(row, { onConflict: "player_id,date,source" });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    // Record that he played (minutes), so match-scoped surfaces include him.
    await sb.from("match_player_minutes").upsert(
      { player_id: playerId, team_id: teamId, match_date: matchDate, minutes_played: Math.round(minutes), is_dnp: false },
      { onConflict: "player_id,match_date" },
    );

    return NextResponse.json({ ok: true, baselineUsed, nPersonal, nSquad });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const body = (await req.json().catch(() => ({}))) as { teamId?: string; playerId?: string; matchDate?: string };
    const playerId = String(body.playerId ?? "");
    const matchDate = String(body.matchDate ?? "");
    if (!playerId || !/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) {
      return NextResponse.json({ error: "playerId and matchDate are required" }, { status: 400 });
    }

    const { teamId } = await requireCoachAccessForTeam(sb, req, body.teamId ?? null);
    if (!teamId) return NextResponse.json({ error: "Team context is required" }, { status: 400 });
    const { data: player } = await sb.from("players").select("id").eq("id", playerId).eq("team_id", teamId).maybeSingle();
    if (!player) return NextResponse.json({ error: "Player not on this team" }, { status: 404 });

    // Delete ONLY the estimated row — never a real pod measurement.
    const { error } = await sb.from("player_external_load_daily")
      .delete()
      .eq("player_id", playerId).eq("date", matchDate).eq("source", "catapult")
      .filter("raw_payload_json->>estimated", "eq", "true");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

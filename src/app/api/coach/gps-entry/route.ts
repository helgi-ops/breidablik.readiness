/**
 * POST /api/coach/gps-entry
 *
 * Manual GPS data entry — upserts a row in player_external_load_daily.
 * Used when a player forgets to turn on their GPS unit.
 *
 * Body: { playerId, date, totalDistance, playerLoad, vb5, vb6, accelerations, decelerations }
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();

    const body = await req.json();
    const {
      playerId,
      date,
      totalDistance,
      playerLoad,
      vb5,
      vb6,
      accelerations,
      decelerations,
      accelB23,
      decelB23,
    } = body as {
      playerId: string;
      date: string;
      totalDistance: number;
      playerLoad: number;
      vb5: number;
      vb6: number;
      accelerations: number;
      decelerations: number;
      accelB23: number;
      decelB23: number;
    };

    if (!playerId || !date) {
      return NextResponse.json({ error: "playerId and date are required" }, { status: 400 });
    }

    // Look up player's team to authorize
    const { data: playerRow } = await sb
      .from("players")
      .select("team_id")
      .eq("id", playerId)
      .single();

    if (!playerRow) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const requestedTeamId = playerRow.team_id;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    // Upsert into player_external_load_daily
    const { error: upsertError } = await sb
      .from("player_external_load_daily")
      .upsert(
        {
          player_id: playerId,
          team_id: teamId,
          date,
          total_distance: totalDistance ?? 0,
          player_load: playerLoad ?? 0,
          total_player_load: playerLoad ?? 0,
          velocity_band5_total_distance: vb5 ?? 0,
          velocity_band6_total_distance: vb6 ?? 0,
          high_speed_distance: (vb5 ?? 0) + (vb6 ?? 0),
          sprint_distance: vb6 ?? 0,
          accelerations: accelerations ?? 0,
          tot_as: accelerations ?? 0,
          decelerations: decelerations ?? 0,
          tot_ds: decelerations ?? 0,
          accel_b2_3_tot_effs_gen2: accelB23 ?? 0,
          decel_b2_3_tot_effs_gen2: decelB23 ?? 0,
          source: "manual",
          activity_count: 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "player_id,date" }
      );

    if (upsertError) {
      console.error("gps-entry upsert error:", upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("gps-entry error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/coach/gps-entry?teamId=...&date=...
 *
 * Returns existing manual GPS entries for the date so the form can pre-fill.
 */
export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);
    const requestedTeamId = (url.searchParams.get("teamId") || "").trim() || null;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);
    const dateKey = url.searchParams.get("date") ?? "";

    if (!dateKey) {
      return NextResponse.json({ error: "date is required" }, { status: 400 });
    }

    // Roster
    const { data: roster } = await sb
      .from("players")
      .select("id, full_name")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("full_name");

    // Existing entries for date
    const { data: entries } = await sb
      .from("player_external_load_daily")
      .select(
        "player_id, total_distance, total_player_load, velocity_band5_total_distance, velocity_band6_total_distance, accelerations, decelerations, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, source"
      )
      .eq("team_id", teamId)
      .eq("date", dateKey);

    const entryMap: Record<
      string,
      {
        totalDistance: number;
        playerLoad: number;
        vb5: number;
        vb6: number;
        accelerations: number;
        decelerations: number;
        accelB23: number;
        decelB23: number;
        source: string;
      }
    > = {};

    for (const e of entries ?? []) {
      entryMap[e.player_id] = {
        totalDistance: Number(e.total_distance) || 0,
        playerLoad: Number(e.total_player_load) || 0,
        vb5: Number(e.velocity_band5_total_distance) || 0,
        vb6: Number(e.velocity_band6_total_distance) || 0,
        accelerations: Number(e.accelerations) || 0,
        decelerations: Number(e.decelerations) || 0,
        accelB23: Number(e.accel_b2_3_tot_effs_gen2) || 0,
        decelB23: Number(e.decel_b2_3_tot_effs_gen2) || 0,
        source: e.source ?? "unknown",
      };
    }

    return NextResponse.json({
      ok: true,
      roster: (roster ?? []).map((p: { id: string; full_name: string | null }) => ({
        id: p.id,
        name: p.full_name ?? "—",
      })),
      entries: entryMap,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

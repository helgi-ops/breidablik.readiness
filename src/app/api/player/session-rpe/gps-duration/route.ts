import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

/**
 * GET /api/player/session-rpe/gps-duration?date=YYYY-MM-DD
 *
 * Returns the GPS session duration (in minutes) for the authenticated player
 * on the given date. Used to auto-fill the duration field in the RPE form.
 */
export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);

    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ ok: false, error: "Missing or invalid date parameter (YYYY-MM-DD)" }, { status: 400 });
    }

    // Try session_duration_minutes first; fall back to total_player_load / player_load_per_minute
    const { data, error } = await sb
      .from("player_external_load_daily")
      .select("session_duration_minutes, total_player_load, player_load_per_minute")
      .eq("player_id", playerId)
      .eq("date", date)
      .order("total_player_load", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    type Row = { session_duration_minutes: number | null; total_player_load: number | null; player_load_per_minute: number | null };
    const row = data as Row | null;

    let minutes: number | null = null;
    if (row?.session_duration_minutes != null && row.session_duration_minutes > 0) {
      minutes = row.session_duration_minutes;
    } else if (
      row?.total_player_load != null && row.total_player_load > 0 &&
      row?.player_load_per_minute != null && row.player_load_per_minute > 0
    ) {
      // Fallback: estimate duration from player load metrics
      minutes = Math.round(row.total_player_load / row.player_load_per_minute);
    }

    return NextResponse.json({
      ok: true,
      date,
      duration_minutes: minutes != null ? Math.round(minutes) : null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const code = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

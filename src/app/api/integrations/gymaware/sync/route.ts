import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { syncGymAware } from "@/lib/integrations/gymaware/sync";

/**
 * POST /api/integrations/gymaware/sync
 *
 * Triggers a GymAware sync for a team.
 * Body: { teamId: string, date?: string, startDate?: string, endDate?: string, backfillDays?: number }
 *
 * - date: single day sync (default: today)
 * - startDate + endDate: range sync for backfill
 * - backfillDays: shortcut — syncs the last N days (default 90 for first sync)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : null;

    if (!teamId) {
      return NextResponse.json({ error: "teamId is required" }, { status: 400 });
    }

    // Verify team exists
    const sb = getSupabaseAdmin();
    const { data: team } = await sb.from("teams").select("id").eq("id", teamId).maybeSingle();
    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Determine date range
    const today = new Date().toISOString().slice(0, 10);
    let startDate: string;
    let endDate: string;

    if (typeof body.startDate === "string" && typeof body.endDate === "string") {
      startDate = body.startDate.trim();
      endDate = body.endDate.trim();
    } else if (typeof body.backfillDays === "number" && body.backfillDays > 0) {
      const d = new Date();
      d.setDate(d.getDate() - body.backfillDays);
      startDate = d.toISOString().slice(0, 10);
      endDate = today;
    } else if (typeof body.date === "string") {
      startDate = body.date.trim();
      endDate = startDate;
    } else {
      // First sync? Auto-backfill 90 days. Otherwise just today.
      const { data: settings } = await sb
        .from("gymaware_settings")
        .select("last_sync_at")
        .eq("team_id", teamId)
        .maybeSingle();

      if (!settings?.last_sync_at) {
        // First ever sync — backfill 90 days
        const d = new Date();
        d.setDate(d.getDate() - 90);
        startDate = d.toISOString().slice(0, 10);
        endDate = today;
      } else {
        startDate = today;
        endDate = today;
      }
    }

    const result = await syncGymAware(teamId, startDate, endDate === startDate ? undefined : endDate);

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("GymAware sync error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/integrations/gymaware/sync?teamId=...
 *
 * Returns GymAware sync status for a team.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get("teamId");

    if (!teamId) {
      return NextResponse.json({ error: "teamId query param required" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { data: settings } = await sb
      .from("gymaware_settings")
      .select("team_id, account_id, reference_exercise, sync_enabled, last_sync_at")
      .eq("team_id", teamId)
      .maybeSingle();

    if (!settings) {
      return NextResponse.json({ connected: false, message: "No GymAware integration configured" });
    }

    // Count stored sessions
    const { count: sessionCount } = await sb
      .from("gymaware_vbt_sessions")
      .select("id", { count: "exact", head: true })
      .in(
        "player_id",
        (await sb.from("players").select("id").eq("team_id", teamId)).data?.map((p) => p.id) ?? [],
      );

    // Count matched athletes
    const { count: athleteCount } = await sb
      .from("gymaware_athlete_map")
      .select("gymaware_athlete_id", { count: "exact", head: true });

    return NextResponse.json({
      connected: true,
      syncEnabled: settings.sync_enabled,
      lastSyncAt: settings.last_sync_at,
      referenceExercise: settings.reference_exercise,
      storedSessions: sessionCount ?? 0,
      matchedAthletes: athleteCount ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

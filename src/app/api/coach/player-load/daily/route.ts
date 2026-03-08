import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { getLoadBand } from "@/lib/player-load/loadBands";
import type { DailyLoadSummaryResponse, PlayerDailyLoadRow } from "@/lib/player-load/types";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

type PlayerRow = {
  id: string;
  full_name: string | null;
  team_id: string | null;
  user_id: string | null;
};

function validDateKey(input: string | null): string | null {
  if (!input) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

function schemaMissingResponse(details?: string) {
  return NextResponse.json(
    {
      ok: true,
      schemaPending: true,
      code: "PLAYER_DAILY_LOAD_SCHEMA_MISSING",
      error: "player_daily_load table is missing or not applied yet.",
      dateKey: null,
      teamId: null,
      summary: {
        playersWithLoad: 0,
        teamTotalLoad: 0,
        teamAvgLoad: null,
        highestLoad: 0,
        avgRpe: null,
      },
      rows: [],
      missingPlayers: [],
      rosterCount: 0,
      ...(process.env.NODE_ENV !== "production"
        ? {
            details: details ?? null,
            fix: "Apply Supabase migrations (for example: supabase db push).",
          }
        : {}),
    },
    { status: 500 }
  );
}

function isMissingTableError(input: unknown) {
  const err = input as { code?: string; message?: string; details?: string } | null | undefined;
  const code = String(err?.code ?? "");
  const text = `${err?.message ?? ""} ${err?.details ?? ""}`.toLowerCase();
  if (code === "42P01") return true;
  return text.includes("player_daily_load") && (text.includes("schema cache") || text.includes("does not exist"));
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);
    const requestedTeamId = (url.searchParams.get("teamId") || "").trim() || null;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    const timeZone = getOperationalTimezone();
    const dateKey = validDateKey(url.searchParams.get("date")) ?? getDateKeyInTimezone(new Date(), timeZone);

    let rosterQuery = sb.from("players").select("id, full_name, team_id, user_id").not("user_id", "is", null);
    if (teamId) rosterQuery = rosterQuery.eq("team_id", teamId);
    const { data: rosterData, error: rosterErr } = await rosterQuery;
    if (rosterErr) {
      return NextResponse.json({ ok: false, error: rosterErr.message }, { status: 500 });
    }
    const roster = (rosterData ?? []) as PlayerRow[];
    const rosterById = new Map(roster.map((p) => [p.id, p]));
    const rosterIds = roster.map((p) => p.id);

    let loadQuery = sb
      .from("player_daily_load")
      .select("player_id, team_id, load_date, total_sessions, total_load, avg_rpe, total_duration_minutes, latest_submission_at, source")
      .eq("load_date", dateKey)
      .order("total_load", { ascending: false });
    if (teamId) loadQuery = loadQuery.eq("team_id", teamId);
    const { data: loadData, error: loadErr } = await loadQuery;
    if (loadErr) {
      if (isMissingTableError(loadErr)) return schemaMissingResponse(loadErr.message);
      return NextResponse.json({ ok: false, error: loadErr.message }, { status: 500 });
    }

    const rowsBase = (loadData ?? []) as PlayerDailyLoadRow[];
    const rows = rowsBase.map((row) => ({
      ...row,
      player_name: rosterById.get(row.player_id)?.full_name ?? "Unknown player",
      load_band: getLoadBand(Number(row.total_load ?? 0)),
    }));

    const playersWithLoad = rows.length;
    const teamTotalLoad = rows.reduce((acc, row) => acc + Number(row.total_load ?? 0), 0);
    const highestLoad = rows.reduce((acc, row) => Math.max(acc, Number(row.total_load ?? 0)), 0);
    const teamAvgLoad = playersWithLoad > 0 ? Math.round((teamTotalLoad / playersWithLoad) * 10) / 10 : null;
    const avgRpeRaw = rows.reduce((acc, row) => acc + Number(row.avg_rpe ?? 0), 0);
    const avgRpe = playersWithLoad > 0 ? Math.round((avgRpeRaw / playersWithLoad) * 100) / 100 : null;

    const withLoadSet = new Set(rows.map((r) => r.player_id));
    const missingPlayers =
      rosterIds.length > 0
        ? roster
            .filter((p) => !withLoadSet.has(p.id))
            .map((p) => ({
              player_id: p.id,
              player_name: p.full_name ?? "Unknown player",
              status: "NO_SUBMISSION" as const,
            }))
        : [];

    const payload: DailyLoadSummaryResponse = {
      dateKey,
      teamId,
      summary: {
        playersWithLoad,
        teamTotalLoad,
        teamAvgLoad,
        highestLoad,
        avgRpe,
      },
      rows,
      missingPlayers,
    };

    return NextResponse.json({
      ok: true,
      ...payload,
      rosterCount: roster.length,
    });
  } catch (error: unknown) {
    if (isMissingTableError(error)) {
      return schemaMissingResponse(error instanceof Error ? error.message : "Unknown error");
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

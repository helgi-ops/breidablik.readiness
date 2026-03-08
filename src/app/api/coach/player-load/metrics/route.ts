import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { getAcwrBand } from "@/lib/player-load-metrics/acwr";
import type { PlayerLoadMetricsRow } from "@/lib/player-load-metrics/types";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

type PlayerRow = {
  id: string;
  full_name: string | null;
  team_id: string | null;
  user_id: string | null;
};

type MetricsRow = PlayerLoadMetricsRow;

function validDateKey(input: string | null): string | null {
  if (!input) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

function isMissingMetricsTableError(error: { code?: string; message?: string; details?: string } | null | undefined) {
  const code = String(error?.code ?? "");
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  if (code === "42P01") return true;
  return text.includes("player_load_metrics") && (text.includes("schema cache") || text.includes("does not exist"));
}

function schemaMissingResponse(details?: string) {
  return NextResponse.json(
    {
      ok: true,
      schemaPending: true,
      code: "PLAYER_LOAD_METRICS_SCHEMA_MISSING",
      error: "player_load_metrics table is missing or not applied yet.",
      dateKey: null,
      teamId: null,
      summary: {
        avgAcuteLoad: null,
        avgChronicLoad: null,
        avgAcwr: null,
        acwrCautionCount: 0,
        acwrRiskCount: 0,
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
    if (rosterErr) return NextResponse.json({ ok: false, error: rosterErr.message }, { status: 500 });
    const roster = (rosterData ?? []) as PlayerRow[];
    const rosterById = new Map(roster.map((p) => [p.id, p]));

    let query = sb
      .from("player_load_metrics")
      .select("player_id, team_id, metric_date, daily_load, acute_load_7d, chronic_load_28d, acwr, load_trend")
      .eq("metric_date", dateKey)
      .order("acwr", { ascending: false, nullsFirst: false });
    if (teamId) query = query.eq("team_id", teamId);

    const { data, error } = await query;
    if (error) {
      if (isMissingMetricsTableError(error)) return schemaMissingResponse(error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rowsRaw = (data ?? []) as MetricsRow[];
    const rows = rowsRaw.map((row) => ({
      ...row,
      player_name: rosterById.get(row.player_id)?.full_name ?? "Unknown player",
      acwr_band: getAcwrBand(row.acwr),
    }));

    const count = rows.length;
    const avgAcuteLoad = count > 0 ? Math.round((rows.reduce((acc, r) => acc + Number(r.acute_load_7d ?? 0), 0) / count) * 100) / 100 : null;
    const avgChronicLoad =
      count > 0 ? Math.round((rows.reduce((acc, r) => acc + Number(r.chronic_load_28d ?? 0), 0) / count) * 100) / 100 : null;
    const acwrVals = rows.filter((r) => r.acwr != null).map((r) => Number(r.acwr));
    const avgAcwr = acwrVals.length > 0 ? Math.round((acwrVals.reduce((acc, v) => acc + v, 0) / acwrVals.length) * 1000) / 1000 : null;
    const acwrCautionCount = rows.filter((r) => r.acwr_band === "CAUTION").length;
    const acwrRiskCount = rows.filter((r) => r.acwr_band === "RISK").length;

    const rowSet = new Set(rows.map((r) => r.player_id));
    const missingPlayers = roster
      .filter((p) => !rowSet.has(p.id))
      .map((p) => ({
        player_id: p.id,
        player_name: p.full_name ?? "Unknown player",
        status: "NO_SUBMISSION" as const,
      }));

    return NextResponse.json({
      ok: true,
      dateKey,
      teamId,
      summary: {
        avgAcuteLoad,
        avgChronicLoad,
        avgAcwr,
        acwrCautionCount,
        acwrRiskCount,
      },
      rows,
      missingPlayers,
      rosterCount: roster.length,
    });
  } catch (error: unknown) {
    if (isMissingMetricsTableError(error as { code?: string; message?: string; details?: string })) {
      return schemaMissingResponse(error instanceof Error ? error.message : "Unknown error");
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

function validDateKey(input: string | null): string | null {
  if (!input) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

function todayInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/**
 * POST /api/coach/impute
 * Triggers the imputation functions for a given team and date.
 * Fills in readiness and RPE rows for players who haven't submitted,
 * using their rolling 10-day median (or team average as fallback for RPE).
 *
 * Body: { teamId?: string, date?: string }
 * Returns: { ok, date, readiness_imputed, rpe_imputed }
 */
export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));
    const requestedTeamId = (body?.teamId ?? "").trim() || null;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    const tz = process.env.APP_TIMEZONE || "Atlantic/Reykjavik";
    const dateKey = validDateKey(body?.date) ?? todayInTz(tz);

    // Call the Postgres wrapper function
    const { data, error } = await sb.rpc("fn_impute_team_day", {
      p_team_id: teamId,
      p_date: dateKey,
    });

    if (error) {
      console.error("[impute] rpc error", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const result = data as { date: string; team_id: string; readiness_imputed: number; rpe_imputed: number } | null;

    return NextResponse.json({
      ok: true,
      date: result?.date ?? dateKey,
      teamId,
      readiness_imputed: result?.readiness_imputed ?? 0,
      rpe_imputed: result?.rpe_imputed ?? 0,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

/**
 * GET /api/coach/impute?teamId=&date=
 * Returns current compliance status without running imputation.
 * Shows how many players are missing check-ins and RPE for the given date.
 */
export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);
    const requestedTeamId = (url.searchParams.get("teamId") ?? "").trim() || null;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    const tz = process.env.APP_TIMEZONE || "Atlantic/Reykjavik";
    const dateKey = validDateKey(url.searchParams.get("date")) ?? todayInTz(tz);

    // Compliance summary from view
    const { data: compliance, error: cErr } = await sb
      .from("v_player_submission_compliance")
      .select("player_id, full_name, checkin_status, rpe_status, had_gps_session")
      .eq("team_id", teamId)
      .eq("day", dateKey);

    if (cErr) {
      return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    }

    const rows = (compliance ?? []) as Array<{
      player_id: string;
      full_name: string;
      checkin_status: "submitted" | "imputed" | "missing";
      rpe_status: "submitted" | "imputed" | "missing";
      had_gps_session: boolean;
    }>;

    const summary = {
      checkin: {
        submitted: rows.filter((r) => r.checkin_status === "submitted").length,
        imputed:   rows.filter((r) => r.checkin_status === "imputed").length,
        missing:   rows.filter((r) => r.checkin_status === "missing").length,
      },
      rpe: {
        submitted: rows.filter((r) => r.had_gps_session && r.rpe_status === "submitted").length,
        imputed:   rows.filter((r) => r.had_gps_session && r.rpe_status === "imputed").length,
        missing:   rows.filter((r) => r.had_gps_session && r.rpe_status === "missing").length,
      },
    };

    const missing = rows
      .filter((r) => r.checkin_status === "missing" || (r.had_gps_session && r.rpe_status === "missing"))
      .map((r) => ({
        player_id:      r.player_id,
        full_name:      r.full_name,
        missing_checkin: r.checkin_status === "missing",
        missing_rpe:     r.had_gps_session && r.rpe_status === "missing",
      }));

    return NextResponse.json({ ok: true, date: dateKey, teamId, summary, missing });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

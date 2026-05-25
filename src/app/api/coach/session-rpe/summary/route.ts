import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { getSessionLoadBand, resolveEffectiveSessionType } from "@/lib/session-rpe/formatters";

type PlayerRow = {
  id: string;
  full_name: string | null;
  team_id: string | null;
  user_id: string | null;
};

type EntryRow = {
  id: string;
  player_id: string;
  team_id: string | null;
  session_date: string;
  session_type: string;
  session_name: string | null;
  duration_minutes: number;
  rpe: number;
  session_load: number;
  submitted_at: string;
};

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function dateKeyInTimezone(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function minusDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);

    const requestedTeamId = (url.searchParams.get("teamId") || "").trim() || null;
    const requestedDate = (url.searchParams.get("date") || "").trim();

    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);
    const timeZone = process.env.APP_TIMEZONE || "Atlantic/Reykjavik";
    const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : dateKeyInTimezone(timeZone);
    const yesterdayKey = minusDays(dateKey, 1);

    let playersQuery = sb.from("players").select("id, full_name, team_id, user_id").not("user_id", "is", null);
    if (teamId) {
      playersQuery = playersQuery.eq("team_id", teamId);
    }

    const { data: playerData, error: playersErr } = await playersQuery;
    if (playersErr) return NextResponse.json({ ok: false, error: playersErr.message }, { status: 500 });

    const players = (playerData ?? []) as PlayerRow[];
    const playerIds = players.map((p) => p.id);

    if (!playerIds.length) {
      return NextResponse.json({
        ok: true,
        dateKey,
        teamId,
        entries: [],
        dailyTotals: [],
        missingPlayers: [],
        summary: {
          totalExpectedPlayers: 0,
          totalSubmissions: 0,
          missingSubmissions: 0,
          avgRpe: null,
          totalDailyLoad: 0,
          yesterdayTotalDailyLoad: 0,
        },
      });
    }

    const { data: entriesData, error: entriesErr } = await sb
      .from("session_rpe_entries")
      .select("id, player_id, team_id, session_date, session_type, session_name, duration_minutes, rpe, session_load, submitted_at")
      .eq("session_date", dateKey)
      .in("player_id", playerIds)
      .order("submitted_at", { ascending: false });

    if (entriesErr) return NextResponse.json({ ok: false, error: entriesErr.message }, { status: 500 });

    const { data: yesterdayData, error: yErr } = await sb
      .from("session_rpe_entries")
      .select("session_load")
      .eq("session_date", yesterdayKey)
      .in("player_id", playerIds);

    if (yErr) return NextResponse.json({ ok: false, error: yErr.message }, { status: 500 });

    // Week setup is the coach's authoritative plan for the day. The RPE
    // monitoring view defers to it so a match day reads as a match even when
    // players left the session-type at its training default.
    let weekSetupDay: { day_type: string; focus: string | null } | null = null;
    if (teamId) {
      const { data: wpData } = await sb
        .from("week_plans")
        .select("day_type, focus")
        .eq("team_id", teamId)
        .eq("day_date", dateKey)
        .maybeSingle();
      if (wpData) {
        weekSetupDay = {
          day_type: String((wpData as { day_type?: string }).day_type ?? ""),
          focus: ((wpData as { focus?: string | null }).focus ?? null) as string | null,
        };
      }
    }

    const entries = (entriesData ?? []) as EntryRow[];
    const byPlayer = new Map<string, PlayerRow>();
    for (const p of players) byPlayer.set(p.id, p);

    const submittedPlayerSet = new Set(entries.map((e) => e.player_id));

    const enrichedEntries = entries.map((entry) => ({
      ...entry,
      player_name: byPlayer.get(entry.player_id)?.full_name ?? "Unknown player",
      load_band: getSessionLoadBand(Number(entry.session_load ?? 0)),
      // Display type resolved against the Week setup (match day → match).
      effective_session_type: resolveEffectiveSessionType(
        entry.session_type,
        weekSetupDay?.day_type,
      ),
    }));

    const dailyTotalsMap = new Map<
      string,
      {
        player_id: string;
        player_name: string;
        team_id: string | null;
        session_date: string;
        total_sessions: number;
        daily_load_total: number;
        total_duration_minutes: number;
        avg_rpe_sum: number;
        latest_submission_at: string | null;
      }
    >();

    for (const entry of entries) {
      const cur = dailyTotalsMap.get(entry.player_id) ?? {
        player_id: entry.player_id,
        player_name: byPlayer.get(entry.player_id)?.full_name ?? "Unknown player",
        team_id: entry.team_id,
        session_date: entry.session_date,
        total_sessions: 0,
        daily_load_total: 0,
        total_duration_minutes: 0,
        avg_rpe_sum: 0,
        latest_submission_at: null,
      };
      cur.total_sessions += 1;
      cur.daily_load_total += Number(entry.session_load ?? 0);
      cur.total_duration_minutes += Number(entry.duration_minutes ?? 0);
      cur.avg_rpe_sum += Number(entry.rpe ?? 0);
      if (!cur.latest_submission_at || String(entry.submitted_at) > String(cur.latest_submission_at)) {
        cur.latest_submission_at = entry.submitted_at;
      }
      dailyTotalsMap.set(entry.player_id, cur);
    }

    const dailyTotals = Array.from(dailyTotalsMap.values())
      .map((item) => ({
        player_id: item.player_id,
        player_name: item.player_name,
        team_id: item.team_id,
        session_date: item.session_date,
        total_sessions: item.total_sessions,
        daily_load_total: item.daily_load_total,
        avg_rpe: item.total_sessions > 0 ? Math.round((item.avg_rpe_sum / item.total_sessions) * 10) / 10 : null,
        total_duration_minutes: item.total_duration_minutes,
        latest_submission_at: item.latest_submission_at,
        load_band: getSessionLoadBand(item.daily_load_total),
      }))
      .sort((a, b) => b.daily_load_total - a.daily_load_total);

    const missingPlayers = players
      .filter((p) => !submittedPlayerSet.has(p.id))
      .map((p) => ({
        player_id: p.id,
        player_name: p.full_name ?? "Unknown player",
        status: "MISSING" as const,
      }));

    const totalSubmissions = entries.length;
    const totalDailyLoad = entries.reduce((acc, row) => acc + Number(row.session_load ?? 0), 0);
    const avgRpeRaw = entries.length ? entries.reduce((acc, row) => acc + Number(row.rpe ?? 0), 0) / entries.length : null;

    const yesterdayTotalDailyLoad = ((yesterdayData ?? []) as Array<{ session_load: number | null }>).reduce(
      (acc, row) => acc + Number(row.session_load ?? 0),
      0
    );

    return NextResponse.json({
      ok: true,
      dateKey,
      teamId,
      weekSetupDay,
      entries: enrichedEntries,
      dailyTotals,
      missingPlayers,
      summary: {
        totalExpectedPlayers: players.length,
        totalSubmissions,
        missingSubmissions: missingPlayers.length,
        avgRpe: avgRpeRaw == null ? null : Math.round(avgRpeRaw * 10) / 10,
        totalDailyLoad,
        yesterdayTotalDailyLoad,
      },
    });
  } catch (error: unknown) {
    const message = toMessage(error);
    const code = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

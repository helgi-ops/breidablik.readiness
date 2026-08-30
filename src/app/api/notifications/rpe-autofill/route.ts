import { NextResponse } from "next/server";
import { type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer as getAdminClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

/**
 * Nightly auto-fill cron — runs at 23:00 local time (Atlantic/Reykjavik).
 *
 * Two passes per non-OFF team:
 *   1. RPE pass: legacy team-average fill for missing session_rpe_entries.
 *      If no player submitted, team is skipped (logged as "no_baseline").
 *   2. Imputation pass: calls fn_impute_team_day RPC which fills BOTH
 *      missing check-ins (readiness) AND missing RPE for the date using
 *      a player-specific 10-day rolling median (with team average as
 *      fallback for RPE). The pass-1 output is the input for pass-2's
 *      RPE-coverage check, so any RPE filled in pass-1 is preserved as-is.
 *
 * Exception: If today is an OFF day in Week_Setup (week_plans.day_type = 'OFF')
 * for a team, that team is skipped entirely (no auto-fill on rest days).
 *
 * Lag protection (added 2026-04-28): Vercel cron can fire 30+ min late.
 * If todayDateKey() runs after midnight Iceland time, the "today" date
 * has rolled to the NEW day — we'd autofill for tomorrow's morning
 * check-in window, which is exactly what coaches don't want. The fix
 * is in resolveTargetDate() below: when execution happens between
 * midnight and noon Iceland time, target the day that JUST ended
 * (yesterday) instead of "today". This makes the cron deterministic
 * regardless of Vercel scheduling lag.
 *
 * Replaces the old manual "Fylla inn missing" coach-dashboard button — the
 * system now handles imputation automatically every night.
 */

const APP_TZ = process.env.APP_TIMEZONE || "Atlantic/Reykjavik";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}


function isAuthorizedCron(req: Request) {
  const header = req.headers.get("x-cron-secret") || "";
  const querySecret = new URL(req.url).searchParams.get("secret") || "";
  const expected = process.env.REMINDER_CRON_SECRET || "";
  // Vercel cron sends an Authorization header too — allow either.
  const authHeader = req.headers.get("authorization") || "";
  const bearerOk =
    !!process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;
  return (
    bearerOk || (Boolean(expected) && (header === expected || querySecret === expected))
  );
}

function todayDateKey(): string {
  // YYYY-MM-DD in APP_TZ
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/**
 * Lag-aware date resolver for the nightly cron.
 *
 * The cron is scheduled for 23:00 Iceland time but Vercel cron can fire
 * 10-60 minutes late. If we ran at, say, 00:15 Iceland time on Apr 28
 * and used "today" naively, we'd autofill for Apr 28 — *before* players
 * had any chance to check in for Apr 28. That's the opposite of what
 * coaches want (autofill should be a 23:00 fallback for the day that's
 * ending, NOT a midnight pre-fill for the day that's starting).
 *
 * Rule: if the current Iceland-local hour is < 12 (i.e. the cron lagged
 * past midnight), target the day that JUST ended (yesterday). Otherwise
 * target today.
 *
 * This makes the cron deterministic about which date it fills regardless
 * of when Vercel actually fires it.
 */
function resolveTargetDate(): string {
  const hourFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TZ,
    hour: "2-digit",
    hour12: false,
  });
  const localHour = parseInt(hourFmt.format(new Date()).slice(0, 2), 10);
  const today = todayDateKey();
  if (Number.isFinite(localHour) && localHour < 12) {
    // Lagged past midnight — return yesterday in APP_TZ
    const d = new Date(`${today}T12:00:00Z`); // noon UTC of "today" key
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return today;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

type TeamRow = { id: string };
type PlayerRow = { id: string; team_id: string | null };
type RpeEntry = {
  player_id: string;
  team_id: string | null;
  rpe: number;
  duration_minutes: number;
};
type OffPlan = { team_id: string; day_type: string };

interface TeamResult {
  team_id: string;
  status:
    | "off_day"
    | "no_baseline"
    | "all_submitted"
    | "deferred_to_pass2"
    | "filled"
    | "no_players";
  filled_count?: number;
  avg_rpe?: number;
  avg_duration?: number;
  missing_player_ids?: string[];
  // Missing GPS-trained players handed to Pass 2 for per-player MD-day imputation.
  gps_deferred?: number;
  // Imputation pass — runs fn_impute_team_day for check-ins + leftover RPE
  imputation?: {
    readiness_imputed: number;
    rpe_imputed: number;
    error?: string;
  };
}

async function autoFillMissingRpe(sb: SupabaseClient): Promise<{
  date_key: string;
  results: TeamResult[];
  total_filled: number;
  total_gps_deferred: number;
  total_readiness_imputed: number;
  total_rpe_imputed: number;
}> {
  // Use lag-aware date resolver, NOT todayDateKey() — see resolveTargetDate()
  // docstring above for why. If Vercel cron fires past midnight Iceland time,
  // we must target yesterday (the day that just ended) instead of today, or
  // we'd autofill the new day before any player has had a chance to check in.
  const dateKey = resolveTargetDate();

  // 1. OFF teams for today
  const { data: offPlans, error: offErr } = await sb
    .from("week_plans")
    .select("team_id, day_type")
    .eq("day_date", dateKey)
    .eq("day_type", "OFF");
  if (offErr) throw offErr;
  const offTeamIds = new Set((offPlans as OffPlan[] | null)?.map((r) => r.team_id) ?? []);

  // 2. All teams
  const { data: teams, error: teamsErr } = await sb
    .from("teams")
    .select("id");
  if (teamsErr) throw teamsErr;
  const teamRows = (teams as TeamRow[] | null) ?? [];

  // 3. All players grouped by team
  const { data: players, error: playersErr } = await sb
    .from("players")
    .select("id, team_id");
  if (playersErr) throw playersErr;
  const playerRows = (players as PlayerRow[] | null) ?? [];
  const playersByTeam = new Map<string, string[]>();
  for (const p of playerRows) {
    if (!p.team_id) continue;
    const list = playersByTeam.get(p.team_id) ?? [];
    list.push(p.id);
    playersByTeam.set(p.team_id, list);
  }

  // 4. All RPE entries submitted today
  const { data: entries, error: entriesErr } = await sb
    .from("session_rpe_entries")
    .select("player_id, team_id, rpe, duration_minutes")
    .eq("session_date", dateKey);
  if (entriesErr) throw entriesErr;
  const entryRows = (entries as RpeEntry[] | null) ?? [];

  // GPS-trained players for this date — Pass 1 DEFERS these to Pass 2 so they get
  // a per-player, MD-day-aware estimate (same-MD-tag median → 10-day median → team
  // avg) instead of the flat team average. Predicate must mirror fn_impute_missing_rpe's
  // inclusion (source='catapult', total_distance>0) exactly; the hardened Pass-2
  // existence check makes a double-fill impossible even if the sets ever disagree.
  const { data: gpsRows, error: gpsErr } = await sb
    .from("player_external_load_daily")
    .select("player_id")
    .eq("date", dateKey)
    .eq("source", "catapult")
    .gt("total_distance", 0);
  if (gpsErr) throw gpsErr;
  const gpsTrainedIds = new Set(
    ((gpsRows as Array<{ player_id: string }> | null) ?? []).map((r) => r.player_id),
  );

  // Group submitted-player IDs and stats per team
  const submittedByTeam = new Map<
    string,
    { playerIds: Set<string>; rpeSum: number; durSum: number; count: number }
  >();
  // Also index by team -> playerIds regardless of team (for players with null
  // team on the entry, fall back to their current player.team_id).
  const playerTeamLookup = new Map<string, string | null>();
  for (const p of playerRows) playerTeamLookup.set(p.id, p.team_id);

  for (const e of entryRows) {
    const teamId = e.team_id ?? playerTeamLookup.get(e.player_id) ?? null;
    if (!teamId) continue;
    let bucket = submittedByTeam.get(teamId);
    if (!bucket) {
      bucket = { playerIds: new Set(), rpeSum: 0, durSum: 0, count: 0 };
      submittedByTeam.set(teamId, bucket);
    }
    bucket.playerIds.add(e.player_id);
    bucket.rpeSum += Number(e.rpe) || 0;
    bucket.durSum += Number(e.duration_minutes) || 0;
    bucket.count += 1;
  }

  // 5. Compute inserts per team
  const results: TeamResult[] = [];
  const insertRows: Array<Record<string, unknown>> = [];

  for (const team of teamRows) {
    const teamId = team.id;

    if (offTeamIds.has(teamId)) {
      results.push({ team_id: teamId, status: "off_day" });
      continue;
    }

    const teamPlayers = playersByTeam.get(teamId) ?? [];
    if (teamPlayers.length === 0) {
      results.push({ team_id: teamId, status: "no_players" });
      continue;
    }

    const bucket = submittedByTeam.get(teamId);
    if (!bucket || bucket.count === 0) {
      results.push({ team_id: teamId, status: "no_baseline" });
      continue;
    }

    // Missing = no real submission AND not GPS-trained (GPS players are left for
    // Pass 2's per-player MD-day-aware imputation). A GPS player who forgot RPE is
    // therefore estimated from his own usual load for that MD-day, not the flat
    // team average.
    const missingAll = teamPlayers.filter((pid) => !bucket.playerIds.has(pid));
    const deferredToPass2 = missingAll.filter((pid) => gpsTrainedIds.has(pid)).length;
    const missing = missingAll.filter((pid) => !gpsTrainedIds.has(pid));
    if (missing.length === 0) {
      results.push({
        team_id: teamId,
        status: deferredToPass2 > 0 ? "deferred_to_pass2" : "all_submitted",
        gps_deferred: deferredToPass2 || undefined,
      });
      continue;
    }

    const avgRpe = round1(bucket.rpeSum / bucket.count);
    const avgDurRaw = Math.round(bucket.durSum / bucket.count);
    const avgDur = Math.max(1, Math.min(300, avgDurRaw || 60));

    for (const playerId of missing) {
      insertRows.push({
        player_id: playerId,
        team_id: teamId,
        session_date: dateKey,
        session_type: "team_training",
        session_name: "Auto-fill (team average)",
        duration_minutes: avgDur,
        rpe: avgRpe,
        source: "auto_fill",
        notes: `Auto-filled at 23:30 local. Team avg from ${bucket.count} submission(s).`,
      });
    }

    results.push({
      team_id: teamId,
      status: "filled",
      filled_count: missing.length,
      avg_rpe: avgRpe,
      avg_duration: avgDur,
      missing_player_ids: missing,
      gps_deferred: deferredToPass2 || undefined,
    });
  }

  let totalFilled = 0;
  if (insertRows.length > 0) {
    const { error: insErr, count } = await sb
      .from("session_rpe_entries")
      .insert(insertRows, { count: "exact" });
    if (insErr) throw insErr;
    totalFilled = count ?? insertRows.length;
  }

  // ── Pass 2: imputation (check-ins + any leftover RPE) ──────────────────
  // For every non-OFF team, call fn_impute_team_day which fills both check-ins
  // and RPE with a player-specific, MD-day-aware estimate (same-MD-tag median →
  // 10-day median → day's real team average). Pass-1 above auto-filled only the
  // NON-GPS missing players with the flat team average, so this pass now owns:
  //   • every GPS-trained player who forgot RPE (deferred_to_pass2 / gps_deferred), and
  //   • teams with zero submissions ("no_baseline") that Pass 1 skipped entirely.
  let totalReadinessImputed = 0;
  let totalRpeImputed = 0;
  for (const result of results) {
    if (result.status === "off_day" || result.status === "no_players") continue;
    const { data: imp, error: impErr } = await sb.rpc("fn_impute_team_day", {
      p_team_id: result.team_id,
      p_date: dateKey,
    });
    if (impErr) {
      result.imputation = { readiness_imputed: 0, rpe_imputed: 0, error: impErr.message };
      continue;
    }
    const r = imp as { readiness_imputed?: number; rpe_imputed?: number } | null;
    const ri = Number(r?.readiness_imputed ?? 0);
    const rpe = Number(r?.rpe_imputed ?? 0);
    result.imputation = { readiness_imputed: ri, rpe_imputed: rpe };
    totalReadinessImputed += ri;
    totalRpeImputed += rpe;
  }

  const totalGpsDeferred = results.reduce((s, r) => s + (r.gps_deferred ?? 0), 0);

  return {
    date_key: dateKey,
    results,
    total_filled: totalFilled,
    total_gps_deferred: totalGpsDeferred,
    total_readiness_imputed: totalReadinessImputed,
    total_rpe_imputed: totalRpeImputed,
  };
}

export async function POST(req: Request) {
  try {
    if (!isAuthorizedCron(req)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const sb = getAdminClient();
    const result = await autoFillMissingRpe(sb);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}

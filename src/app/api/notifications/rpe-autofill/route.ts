import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * RPE auto-fill cron.
 *
 * Rule: If a player hasn't submitted a session RPE for today by 23:30 local
 * time (Atlantic/Reykjavik), auto-fill a placeholder entry using the average
 * RPE and average duration of the team's existing submissions for the day.
 *
 * Exception: If today is an OFF day in Week_Setup (week_plans.day_type = 'OFF')
 * for a team, that team is skipped entirely.
 *
 * If no player on the team submitted, there is no average to use, so that
 * team is skipped (logged as "no_baseline").
 */

const APP_TZ = process.env.APP_TIMEZONE || "Atlantic/Reykjavik";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getAdminClient() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
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
    | "filled"
    | "no_players";
  filled_count?: number;
  avg_rpe?: number;
  avg_duration?: number;
  missing_player_ids?: string[];
}

async function autoFillMissingRpe(sb: SupabaseClient): Promise<{
  date_key: string;
  results: TeamResult[];
  total_filled: number;
}> {
  const dateKey = todayDateKey();

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

    const missing = teamPlayers.filter((pid) => !bucket.playerIds.has(pid));
    if (missing.length === 0) {
      results.push({ team_id: teamId, status: "all_submitted" });
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

  return { date_key: dateKey, results, total_filled: totalFilled };
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

export const runtime = "nodejs";

/**
 * GET /api/coach/readiness-load?date=YYYY-MM-DD&team_id=...
 *
 * Returns data for the Readiness × Load quadrant view on the Coach Dashboard.
 * Combines:
 *   - today's readiness (readiness_entries.total_score) per active player
 *   - planned Player Load for today (saved_sessions.target_pl, most recent
 *     saved session whose session_date = date; falls back to most recent
 *     overall saved session for the team)
 *   - per-player individualised PL via training_action modifier:
 *       full     → 100%
 *       modified → 70%
 *       recovery → 30%
 *       null     → 100%
 *
 * Response shape:
 * {
 *   ok: true,
 *   date: "YYYY-MM-DD",
 *   team_target_pl: number | null,
 *   session_name: string | null,
 *   thresholds: { readiness_ready, readiness_tired, pl_high_ratio },
 *   players: Array<{
 *     player_id, initials, full_name,
 *     readiness: number | null,
 *     planned_pl: number | null,
 *     action: 'full' | 'modified' | 'recovery' | null,
 *     quadrant: 'green' | 'blue' | 'yellow' | 'red' | 'neutral'
 *   }>
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

// readiness_entries.total_score is on a 5–25 scale (5 dimensions × 1–5)
const READY_THRESHOLD = 18; // ≥ 18 = ready  (≈72% of 25)
const TIRED_THRESHOLD = 15; // < 15 = tired (60% of 25)
const READINESS_MAX = 25;
const PL_HIGH_RATIO = 0.7; // planned_pl ≥ 70% of team target = high
const DEFAULT_TARGET_PL = 500; // fallback when no saved session exists for the team


async function getCoachTeam(req: NextRequest, targetTeamId?: string | null) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing authentication", status: 401 as const };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 as const };

  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();

  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role))
    return { error: "Insufficient permissions", status: 403 as const };

  const primaryTeamId = prof?.team_id as string | null;
  if (!primaryTeamId) return { error: "Coach not linked to a team", status: 400 as const };

  if (!targetTeamId) return { userId, teamId: primaryTeamId, role };
  if (targetTeamId === primaryTeamId) return { userId, teamId: targetTeamId, role };

  const { data: coachRow } = await supabase
    .from("coach_teams")
    .select("team_id")
    .eq("coach_id", userId)
    .eq("team_id", targetTeamId)
    .maybeSingle();

  if (!coachRow) return { error: "No access to this team", status: 403 as const };
  return { userId, teamId: targetTeamId, role };
}

function initialsOf(fullName: string | null | undefined): string {
  const s = String(fullName ?? "").trim();
  if (!s) return "??";
  const parts = s.split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "??";
}

function actionModifier(action: string | null | undefined): number {
  const a = String(action ?? "").toUpperCase();
  if (a === "REDUCED" || a === "MODIFIED") return 0.7;
  if (a === "RECOVERY") return 0.3;
  return 1.0; // FULL, full, or null
}

function normalizeAction(action: string | null | undefined): "full" | "modified" | "recovery" | null {
  const a = String(action ?? "").toUpperCase();
  if (a === "FULL") return "full";
  if (a === "REDUCED" || a === "MODIFIED") return "modified";
  if (a === "RECOVERY") return "recovery";
  return null;
}

type Quadrant = "green" | "blue" | "yellow" | "red" | "neutral";

function quadrantOf(
  readiness: number | null,
  plannedPl: number | null,
  teamTargetPl: number | null
): Quadrant {
  if (readiness == null) return "neutral";
  const isReady = readiness >= READY_THRESHOLD;
  const isTired = readiness < TIRED_THRESHOLD;
  if (!isReady && !isTired) return "neutral"; // 6 ≤ r < 7

  const ratio = teamTargetPl && teamTargetPl > 0 && plannedPl != null ? plannedPl / teamTargetPl : null;
  const isHighLoad = ratio != null && ratio >= PL_HIGH_RATIO;

  if (isReady && isHighLoad) return "blue";
  if (isReady && !isHighLoad) return "green";
  if (isTired && isHighLoad) return "red";
  return "yellow"; // tired + low load
}

export async function GET(req: NextRequest) {
  try {
    const teamId = req.nextUrl.searchParams.get("team_id");
    const dateParam = req.nextUrl.searchParams.get("date");
    const date =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : new Date().toISOString().slice(0, 10);

    const auth = await getCoachTeam(req, teamId);
    if ("error" in auth)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const supabase = getSupabase();

    // 1) Active players for this team
    const { data: players, error: pErr } = await supabase
      .from("players")
      .select("id, full_name")
      .eq("team_id", auth.teamId)
      .eq("is_active", true)
      .eq("status", "ACTIVE");

    if (pErr)
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });

    const playerIds = (players ?? []).map((p) => p.id);

    // 2) Readiness entries for the date
    const { data: entries, error: eErr } = playerIds.length
      ? await supabase
          .from("readiness_entries")
          .select("player_id, total_score, training_action")
          .eq("team_id", auth.teamId)
          .eq("entry_date", date)
          .in("player_id", playerIds)
      : { data: [], error: null };

    if (eErr)
      return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });

    const entryByPlayer = new Map<string, { total_score: number | null; training_action: string | null }>();
    for (const e of entries ?? []) {
      entryByPlayer.set(e.player_id as string, {
        total_score: (e.total_score ?? null) as number | null,
        training_action: (e.training_action ?? null) as string | null,
      });
    }

    // 3) Team target_pl: most recent saved session for this date; fallback to most recent overall;
    //    final fallback to DEFAULT_TARGET_PL so the quadrant is still usable with no sessions yet.
    let teamTargetPl: number | null = null;
    let sessionName: string | null = null;
    let targetPlSource: "session_for_date" | "latest_session" | "default" = "default";

    const { data: dated } = await supabase
      .from("saved_sessions")
      .select("target_pl, session_name, updated_at")
      .eq("team_id", auth.teamId)
      .eq("session_date", date)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (dated && dated.length > 0 && dated[0].target_pl != null) {
      teamTargetPl = Number(dated[0].target_pl);
      sessionName = (dated[0].session_name as string | null) ?? null;
      targetPlSource = "session_for_date";
    } else {
      const { data: latest } = await supabase
        .from("saved_sessions")
        .select("target_pl, session_name")
        .eq("team_id", auth.teamId)
        .is("deleted_at", null)
        .not("target_pl", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (latest && latest.length > 0 && latest[0].target_pl != null) {
        teamTargetPl = Number(latest[0].target_pl);
        sessionName = (latest[0].session_name as string | null) ?? null;
        targetPlSource = "latest_session";
      } else {
        teamTargetPl = DEFAULT_TARGET_PL;
        sessionName = null;
        targetPlSource = "default";
      }
    }

    // 4) Assemble per-player data points
    const rows = (players ?? []).map((p) => {
      const e = entryByPlayer.get(p.id as string);
      const readiness = e?.total_score ?? null;
      const action = e?.training_action ?? null;
      const plannedPl =
        teamTargetPl != null ? Math.round(teamTargetPl * actionModifier(action)) : null;
      return {
        player_id: p.id as string,
        initials: initialsOf(p.full_name as string | null),
        full_name: (p.full_name as string | null) ?? "",
        readiness,
        planned_pl: plannedPl,
        action: normalizeAction(action),
        quadrant: quadrantOf(readiness, plannedPl, teamTargetPl),
      };
    });

    return NextResponse.json({
      ok: true,
      date,
      team_target_pl: teamTargetPl,
      session_name: sessionName,
      target_pl_source: targetPlSource,
      thresholds: {
        readiness_ready: READY_THRESHOLD,
        readiness_tired: TIRED_THRESHOLD,
        readiness_max: READINESS_MAX,
        pl_high_ratio: PL_HIGH_RATIO,
      },
      players: rows,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

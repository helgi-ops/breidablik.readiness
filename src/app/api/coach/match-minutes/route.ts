/**
 * GET  /api/coach/match-minutes?teamId=…&date=YYYY-MM-DD
 * PUT  /api/coach/match-minutes   { teamId, date, minutes: [{ playerId, minutesPlayed }] }
 *
 * Minutes actually played, per player per match — the missing input that lets
 * MicroPulse tell MATCHDAY LOAD apart from MATCH RUNNING.
 *
 * Why this endpoint exists: Catapult splits a match into periods by the stadium
 * clock, not by who is on the pitch. A substitute's pod goes on at half-time and
 * records his touchline warm-up, and all of it lands in the "2nd half" period —
 * so a man who played 20 minutes shows up with ~4,000 m. (HK vs Ægir 2026-07-10:
 * every substitute carried exactly 51.5 min, the whole second half.)
 *
 * GET returns, for each player with GPS on that date: his pod window (summed
 * from player_drill_load period durations), whether he STARTED (a starter has a
 * "1st half" period row), any minutes already entered, and the resulting verdict
 * from classifyMatchLoad. The verdict carries its own plain-language "why" —
 * the coach never has to trust an unexplained number.
 *
 * SOURCE OF TRUTH: match_player_minutes — the app's existing, live minutes table
 * (the "MD+1 Minutes" page writes it; every benchmark surface reads it). Minutes
 * are stored as minutes_played + is_dnp: a DNP row is 0 min played, and NO row
 * means "not entered yet" (→ verdict "unknown"). This route only adds the
 * matchday-load-vs-match-running verdict on top of that table; it does not
 * introduce a second store.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { classifyMatchLoad, type MatchLoadVerdict } from "@/lib/micropulse/matchMinutes";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface PeriodRow {
  player_id: string;
  period_name: string | null;
  duration_min: number | null;
}
interface LoadRow {
  player_id: string;
  total_distance: number | null;
  high_speed_distance: number | null;
  total_player_load: number | null;
  source: string | null;
}
interface MinutesRow {
  player_id: string;
  minutes_played: number;
  is_dnp: boolean | null;
}

export interface MatchMinutesPlayer {
  playerId: string;
  fullName: string | null;
  startedMatch: boolean;
  podMinutes: number | null;
  minutesPlayed: number | null;
  minutesSource: string | null;
  distanceM: number | null;
  playerLoad: number | null;
  verdict: MatchLoadVerdict;
}

/** A starter has a first-half period; a substitute does not. */
function startedFromPeriods(rows: PeriodRow[]): boolean {
  return rows.some((r) => (r.period_name ?? "").toLowerCase().includes("1st"));
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamIdParam = url.searchParams.get("teamId") ?? "";
    const date = url.searchParams.get("date") ?? "";
    if (!ISO_DATE.test(date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { teamId } = await requireCoachAccessForTeam(sb, req, teamIdParam);
    if (!teamId) return NextResponse.json({ error: "Team context is required" }, { status: 400 });

    const [{ data: periods }, { data: load }, { data: entered }, { data: players }] = await Promise.all([
      sb.from("player_drill_load")
        .select("player_id, period_name, duration_min")
        .eq("team_id", teamId).eq("session_date", date),
      sb.from("player_external_load_daily")
        .select("player_id, total_distance, high_speed_distance, total_player_load, source")
        .eq("team_id", teamId).eq("date", date),
      sb.from("match_player_minutes")
        .select("player_id, minutes_played, is_dnp")
        .eq("team_id", teamId).eq("match_date", date),
      sb.from("players").select("id, full_name").eq("team_id", teamId),
    ]);

    const nameOf = new Map((players ?? []).map((p) => [String(p.id), (p as { full_name: string | null }).full_name]));
    const enteredBy = new Map((entered ?? []).map((r) => [String((r as MinutesRow).player_id), r as MinutesRow]));

    const periodsBy = new Map<string, PeriodRow[]>();
    for (const r of (periods ?? []) as PeriodRow[]) {
      const k = String(r.player_id);
      if (!periodsBy.has(k)) periodsBy.set(k, []);
      periodsBy.get(k)!.push(r);
    }

    // A coach's MANUAL entry overrides the catapult row for the same day
    // (forgotten / broken pod) — same precedence as the RTT engine.
    const loadBy = new Map<string, LoadRow>();
    for (const r of (load ?? []) as LoadRow[]) {
      const k = String(r.player_id);
      if (!loadBy.has(k) || r.source === "manual") loadBy.set(k, r);
    }

    const ids = new Set<string>([...periodsBy.keys(), ...loadBy.keys()]);
    const out: MatchMinutesPlayer[] = [];

    for (const playerId of ids) {
      const prs = periodsBy.get(playerId) ?? [];
      const l = loadBy.get(playerId);
      const podMinutes = prs.length
        ? Math.round(prs.reduce((s, r) => s + (Number(r.duration_min) || 0), 0) * 10) / 10
        : null;
      const startedMatch = startedFromPeriods(prs);
      const row = enteredBy.get(playerId);
      // No row = not entered (→ "unknown"). A DNP row is 0 min on the pitch.
      const minutesPlayed = row ? (row.is_dnp ? 0 : Number(row.minutes_played)) : null;
      const distanceM = l?.total_distance != null ? Number(l.total_distance) : null;

      out.push({
        playerId,
        fullName: nameOf.get(playerId) ?? null,
        startedMatch,
        podMinutes,
        minutesPlayed,
        minutesSource: row ? "coach" : null,
        distanceM,
        playerLoad: l?.total_player_load != null ? Number(l.total_player_load) : null,
        verdict: classifyMatchLoad({
          podMinutes,
          minutesPlayed,
          distanceM,
          highSpeedM: l?.high_speed_distance != null ? Number(l.high_speed_distance) : null,
          startedMatch,
        }),
      });
    }

    // Starters first, then by distance — the order a coach reads a match in.
    out.sort((a, b) =>
      Number(b.startedMatch) - Number(a.startedMatch) || (b.distanceM ?? 0) - (a.distanceM ?? 0));

    return NextResponse.json({ teamId, date, players: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const code = /forbidden|access/i.test(msg) ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: code });
  }
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      teamId?: string;
      date?: string;
      minutes?: Array<{ playerId?: string; minutesPlayed?: number | null }>;
    };
    const date = body.date ?? "";
    if (!ISO_DATE.test(date)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { teamId } = await requireCoachAccessForTeam(sb, req, body.teamId ?? "");
    if (!teamId) return NextResponse.json({ error: "Team context is required" }, { status: 400 });

    const rows = (body.minutes ?? []).filter((m) => typeof m.playerId === "string");

    // A null/blank value means "unset" — remove the row rather than storing a
    // zero, because 0 minutes ("named but never came on") is a real, different
    // statement about the player. In match_player_minutes, 0 min IS a DNP row
    // (is_dnp = true), matching the existing MD+1 Minutes page's convention.
    const toDelete = rows.filter((m) => m.minutesPlayed == null).map((m) => m.playerId as string);
    const toUpsert = rows
      .filter((m) => m.minutesPlayed != null)
      .map((m) => {
        const minutes = Math.max(0, Math.min(130, Math.round(Number(m.minutesPlayed))));
        return {
          player_id: m.playerId as string,
          match_date: date,
          team_id: teamId,
          minutes_played: minutes,
          is_dnp: minutes === 0,
        };
      });

    if (toDelete.length) {
      const { error } = await sb.from("match_player_minutes")
        .delete().eq("team_id", teamId).eq("match_date", date).in("player_id", toDelete);
      if (error) throw new Error(error.message);
    }
    if (toUpsert.length) {
      const { error } = await sb.from("match_player_minutes")
        .upsert(toUpsert, { onConflict: "player_id,match_date" });
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ ok: true, saved: toUpsert.length, cleared: toDelete.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const code = /forbidden|access/i.test(msg) ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: code });
  }
}

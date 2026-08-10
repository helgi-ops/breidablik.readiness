/**
 * /api/coach/team/match-intensity-halves?days=180
 *
 * GET — per-player 1st-vs-2nd-half IMA fade across matches, plus the squad
 * figure, from the per-period rows already in `player_drill_load`. Powers the
 * Match Intensity (halves) surface on /coach/match-movement.
 *
 * A conditioning / rotation CONTEXT signal (Akenhead 2013; Mohr 2003) — it
 * never touches the readiness colour or the daily decision. Coach-scoped to the
 * authenticated team. No DB change: the half periods are already ingested.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import {
  classifyHalf,
  computeMatchIntensityHalves,
  computeTeamFade,
  latestMatchHalfCompare,
  minHalfMinutesForSport,
  type HalfPeriodRow,
} from "@/lib/micropulse/matchIntensityHalves";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";

export const runtime = "nodejs";

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get("days"));
  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 730 ? Math.floor(daysRaw) : 180;
  const startIso = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  // Optional: pin the first-half fade panel to the coach's selected match (else latest).
  const dateRaw = url.searchParams.get("date");
  const targetDate = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;

  // Only half periods (all three naming families), team-scoped. "h%" covers both
  // hálfleikur/halfleikur; the JS classifier is the source of truth for the split.
  const { data, error } = await ctx.supabase
    .from("player_drill_load")
    .select(
      "player_id, session_date, saved_session_id, period_name, duration_min, high_ima, " +
        "ima_accel, ima_decel, ima_cod_total, hir_total, player_load_per_min, " +
        "distance_m, vel_b5, vel_b6, max_velocity, " +
        "players!inner(full_name, position, team_id)",
    )
    .eq("players.team_id", ctx.teamId)
    .gte("session_date", startIso)
    .or(
      "period_name.ilike.fyrri h%,period_name.ilike.seinni h%," +
        "period_name.ilike.1st h%,period_name.ilike.2nd h%," +
        "period_name.ilike.first h%,period_name.ilike.second h%",
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type DbRow = {
    player_id: string;
    session_date: string;
    saved_session_id: string | null;
    period_name: string | null;
    duration_min: number | null;
    high_ima: number | null;
    ima_accel: number | null;
    ima_decel: number | null;
    ima_cod_total: number | null;
    hir_total: number | null;
    player_load_per_min: number | null;
    distance_m: number | null;
    vel_b5: number | null;
    vel_b6: number | null;
    max_velocity: number | null;
    players: { full_name: string | null; position: string | null } | { full_name: string | null; position: string | null }[] | null;
  };

  const rows: HalfPeriodRow[] = [];
  for (const r of (data ?? []) as unknown as DbRow[]) {
    const half = classifyHalf(r.period_name);
    if (half == null) continue;
    if (!r.session_date) continue; // the match key is player + date
    const p = Array.isArray(r.players) ? r.players[0] : r.players;
    rows.push({
      playerId: r.player_id,
      playerName: (p?.full_name ?? "—").trim(),
      position: p?.position ?? null,
      savedSessionId: r.saved_session_id, // usually null; kept for reference only
      sessionDate: r.session_date,
      half,
      durationMin: Number(r.duration_min ?? 0) || 0,
      highIma: Number(r.high_ima ?? 0) || 0,
      imaAccel: Number(r.ima_accel ?? 0) || 0,
      imaDecel: Number(r.ima_decel ?? 0) || 0,
      imaCodTotal: Number(r.ima_cod_total ?? 0) || 0,
      hirTotal: r.hir_total != null ? Number(r.hir_total) : null,
      playerLoadPerMin: r.player_load_per_min != null ? Number(r.player_load_per_min) : null,
      distanceM: r.distance_m != null ? Number(r.distance_m) : null,
      velB5: r.vel_b5 != null ? Number(r.vel_b5) : null,
      velB6: r.vel_b6 != null ? Number(r.vel_b6) : null,
      maxVelocity: r.max_velocity != null ? Number(r.max_velocity) : null,
    });
  }

  // Basketball halves are ~20 min (vs football ~45) → lower the both-halves gate.
  const sport = await resolveTeamSport(ctx.supabase, ctx.teamId);
  const minHalf = minHalfMinutesForSport(sport);
  const players = computeMatchIntensityHalves(rows, minHalf);
  const team = computeTeamFade(players);

  // Selected (or last) match: first half vs second half (the within-match drop), squad + per-player.
  const firstHalfFade = latestMatchHalfCompare(rows, minHalf, targetDate);

  return NextResponse.json({ days, team, players, firstHalfFade });
}

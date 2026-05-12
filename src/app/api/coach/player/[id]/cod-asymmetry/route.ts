/**
 * /api/coach/player/[id]/cod-asymmetry
 *
 * Returns L/R Change-of-Direction breakdown by intensity tier (Low / Medium /
 * High) for a single player, summed over the last 14 days. Bishop 2020:
 * high-intensity asymmetry > 15% is the injury-relevant signal — overall %
 * can hide a serious right-side preference at high effort.
 *
 * Pulls from `player_external_load_daily` (source='catapult'):
 *   ima_cod_left_low  / medium / high
 *   ima_cod_right_low / medium / high
 *
 * Response:
 *   {
 *     ok: true,
 *     playerId, date, windowDays: 14, sessionsObserved,
 *     overall: { left, right, asymPct, flag },
 *     tiers: {
 *       low:    { left, right, asymPct, flag },
 *       medium: { left, right, asymPct, flag },
 *       high:   { left, right, asymPct, flag },
 *     },
 *   }
 *
 * Auth: coach access required (must be coach of the player's team).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Bishop 2020 thresholds for L/R asymmetry %.
// 9% = watchful · 15% = concern · 18% = high concern.
const WATCH_PCT = 9;
const CONCERN_PCT = 15;
const HIGH_PCT = 18;

type Flag = "ok" | "watch" | "concern" | "high" | "no_data";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getCoachTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 } as const;
  }
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { userId, teamId } as const;
}

function asymPct(left: number, right: number): number | null {
  const max = Math.max(left, right);
  if (max <= 0) return null;
  return (Math.abs(left - right) / max) * 100;
}

function flagFor(pct: number | null): Flag {
  if (pct == null) return "no_data";
  if (pct >= HIGH_PCT) return "high";
  if (pct >= CONCERN_PCT) return "concern";
  if (pct >= WATCH_PCT) return "watch";
  return "ok";
}

function tierStats(left: number, right: number) {
  const pct = asymPct(left, right);
  return {
    left: Math.round(left),
    right: Math.round(right),
    asymPct: pct == null ? null : Number(pct.toFixed(1)),
    flag: flagFor(pct),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: "Missing player id" }, { status: 400 });
  }

  const auth = await getCoachTeam(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = getSupabase();

  // Verify player belongs to coach's team.
  const { data: playerCheck } = await supabase
    .from("players")
    .select("id, team_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!playerCheck || playerCheck.team_id !== auth.teamId) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const startIso = (() => {
    const d = new Date(`${todayIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 13);
    return d.toISOString().slice(0, 10);
  })();

  const { data: rows, error } = await supabase
    .from("player_external_load_daily")
    .select(
      "date, ima_cod_left_low, ima_cod_left_medium, ima_cod_left_high, ima_cod_right_low, ima_cod_right_medium, ima_cod_right_high",
    )
    .eq("player_id", playerId)
    .eq("source", "catapult")
    .gte("date", startIso)
    .lte("date", todayIso);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    date: string;
    ima_cod_left_low: number | null;
    ima_cod_left_medium: number | null;
    ima_cod_left_high: number | null;
    ima_cod_right_low: number | null;
    ima_cod_right_medium: number | null;
    ima_cod_right_high: number | null;
  };

  const totals = ((rows ?? []) as Row[]).reduce(
    (acc, r) => {
      acc.lLow += Number(r.ima_cod_left_low ?? 0) || 0;
      acc.lMed += Number(r.ima_cod_left_medium ?? 0) || 0;
      acc.lHigh += Number(r.ima_cod_left_high ?? 0) || 0;
      acc.rLow += Number(r.ima_cod_right_low ?? 0) || 0;
      acc.rMed += Number(r.ima_cod_right_medium ?? 0) || 0;
      acc.rHigh += Number(r.ima_cod_right_high ?? 0) || 0;
      // Count any session that contributed at least one CoD on either side.
      const sessionTotal =
        (Number(r.ima_cod_left_low ?? 0) || 0) +
        (Number(r.ima_cod_left_medium ?? 0) || 0) +
        (Number(r.ima_cod_left_high ?? 0) || 0) +
        (Number(r.ima_cod_right_low ?? 0) || 0) +
        (Number(r.ima_cod_right_medium ?? 0) || 0) +
        (Number(r.ima_cod_right_high ?? 0) || 0);
      if (sessionTotal > 0) acc.sessions += 1;
      return acc;
    },
    { lLow: 0, lMed: 0, lHigh: 0, rLow: 0, rMed: 0, rHigh: 0, sessions: 0 },
  );

  const lTotal = totals.lLow + totals.lMed + totals.lHigh;
  const rTotal = totals.rLow + totals.rMed + totals.rHigh;

  return NextResponse.json({
    ok: true,
    playerId,
    date: todayIso,
    windowDays: 14,
    sessionsObserved: totals.sessions,
    overall: tierStats(lTotal, rTotal),
    tiers: {
      low: tierStats(totals.lLow, totals.rLow),
      medium: tierStats(totals.lMed, totals.rMed),
      high: tierStats(totals.lHigh, totals.rHigh),
    },
    /** Bishop 2020 thresholds — exposed so the UI can label its scale. */
    thresholds: { watchPct: WATCH_PCT, concernPct: CONCERN_PCT, highPct: HIGH_PCT },
  });
}

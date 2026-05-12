/**
 * GET /api/coach/team/match-minutes?date=YYYY-MM-DD
 *
 * Returns each player's most recent match minutes within the last 3 days
 * relative to `date` (default: today). Used by the dashboard to populate
 * `_yesterday_match_minutes` + `_yesterday_match_date` fields on the
 * Decision Summary row, which feed the MD+1 hard-recovery guardrail
 * (Carling 2018, Nédélec 2012, Helsen 2018 — 60-min threshold).
 *
 * Response: { ok: true, byPlayer: { [playerId]: { minutes_played: number, match_date: string } } }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("id", userRes.user.id)
    .maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  }
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return NextResponse.json({ ok: true, byPlayer: {} });

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const todayIso =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Date().toISOString().slice(0, 10);

  const fromDate = new Date(`${todayIso}T00:00:00Z`);
  fromDate.setUTCDate(fromDate.getUTCDate() - 3);
  const fromIso = fromDate.toISOString().slice(0, 10);

  // Pull player IDs in this team
  const { data: rosterRows } = await supabase
    .from("players")
    .select("id")
    .eq("team_id", teamId);
  const playerIds = (rosterRows ?? []).map((r) => r.id as string);
  if (playerIds.length === 0) return NextResponse.json({ ok: true, byPlayer: {} });

  // Pull match minutes within the window for every player on the roster
  const { data: minutesRows, error: minutesErr } = await supabase
    .from("match_player_minutes")
    .select("player_id, match_date, minutes_played, is_dnp")
    .in("player_id", playerIds)
    .gte("match_date", fromIso)
    .lte("match_date", todayIso)
    .order("match_date", { ascending: false });

  if (minutesErr) {
    return NextResponse.json({ error: minutesErr.message }, { status: 500 });
  }

  // For each player, take the most recent non-DNP entry within the window.
  const byPlayer: Record<string, { minutes_played: number; match_date: string }> = {};
  for (const row of (minutesRows ?? []) as Array<{
    player_id: string;
    match_date: string;
    minutes_played: number | null;
    is_dnp: boolean | null;
  }>) {
    if (row.is_dnp) continue;
    if (byPlayer[row.player_id]) continue; // already have a more recent entry
    const min = Number(row.minutes_played ?? 0);
    if (!Number.isFinite(min) || min <= 0) continue;
    byPlayer[row.player_id] = {
      minutes_played: min,
      match_date: row.match_date,
    };
  }

  return NextResponse.json({ ok: true, byPlayer });
}

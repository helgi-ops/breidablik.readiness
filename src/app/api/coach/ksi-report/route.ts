/**
 * /api/coach/ksi-report?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * GET — GPS + IMA external-load summary per player over a date window, for the
 * authenticated coach's team. Powers the KSÍ report (national-team / youth
 * national-team call-up load summary). Aggregates the window per player and
 * returns the per-session (daily) breakdown for the detail view.
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

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase } as const;
}

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

type DayMetrics = {
  date: string;
  duration_min: number;
  total_distance: number;
  hsr: number;
  sprint: number;
  player_load: number;
  accels: number;
  decels: number;
  max_vel_kmh: number;
  ima_hsr: number; // band 5-8 total distance
  band5: number;
  band6: number;
  band7: number;
  band8: number;
  ima_acc: number; // inertial accelerations
  ima_dec: number; // inertial decelerations
  cod: number;     // inertial change-of-direction events (L+R, all tiers)
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const toParam = url.searchParams.get("to");
  const fromParam = url.searchParams.get("from");
  const to = toParam && isIso(toParam) ? toParam : today;
  const from = fromParam && isIso(fromParam)
    ? fromParam
    : new Date(Date.parse(to + "T00:00:00Z") - 13 * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await ctx.supabase
    .from("player_external_load_daily")
    .select(
      "player_id, date, session_duration_minutes, total_distance, high_speed_distance, sprint_distance, " +
        "total_player_load, accelerations, decelerations, max_velocity, " +
        "ima_accel, ima_decel, " +
        "ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, " +
        "ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, " +
        "ima_fr_band58_total_distance, ima_fr_band5_total_distance, ima_fr_band6_total_distance, " +
        "ima_fr_band7_total_distance, ima_fr_band8_total_distance, players!inner(full_name, team_id)",
    )
    .eq("source", "catapult")
    .eq("players.team_id", ctx.teamId)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = Record<string, unknown> & {
    player_id: string;
    date: string;
    players: { full_name: string | null } | { full_name: string | null }[] | null;
  };

  const byPlayer = new Map<string, { name: string; days: DayMetrics[] }>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const p = Array.isArray(r.players) ? r.players[0] : r.players;
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, { name: (p?.full_name ?? "—").trim(), days: [] });
    byPlayer.get(r.player_id)!.days.push({
      date: r.date,
      duration_min: Math.round(num(r.session_duration_minutes)),
      total_distance: num(r.total_distance),
      hsr: num(r.high_speed_distance),
      sprint: num(r.sprint_distance),
      player_load: num(r.total_player_load),
      accels: Math.round(num(r.accelerations)),
      decels: Math.round(num(r.decelerations)),
      max_vel_kmh: num(r.max_velocity) * 3.6,
      ima_hsr: num(r.ima_fr_band58_total_distance),
      band5: num(r.ima_fr_band5_total_distance),
      band6: num(r.ima_fr_band6_total_distance),
      band7: num(r.ima_fr_band7_total_distance),
      band8: num(r.ima_fr_band8_total_distance),
      ima_acc: Math.round(num(r.ima_accel)),
      ima_dec: Math.round(num(r.ima_decel)),
      cod: Math.round(
        num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low) +
        num(r.ima_cod_right_high) + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low),
      ),
    });
  }

  const players = Array.from(byPlayer.entries()).map(([player_id, { name, days }]) => {
    const sum = (k: keyof DayMetrics) => days.reduce((s, d) => s + (d[k] as number), 0);
    return {
      player_id,
      full_name: name,
      sessions: days.length,
      agg: {
        total_distance: Math.round(sum("total_distance")),
        hsr: Math.round(sum("hsr")),
        sprint: Math.round(sum("sprint")),
        player_load: Math.round(sum("player_load")),
        accels: sum("accels"),
        decels: sum("decels"),
        max_vel_kmh: Math.round(Math.max(0, ...days.map((d) => d.max_vel_kmh)) * 10) / 10,
        ima_hsr: Math.round(sum("ima_hsr")),
        band5: Math.round(sum("band5")),
        band6: Math.round(sum("band6")),
        band7: Math.round(sum("band7")),
        band8: Math.round(sum("band8")),
        ima_acc: sum("ima_acc"),
        ima_dec: sum("ima_dec"),
        cod: sum("cod"),
      },
      days: days.map((d) => ({ ...d, max_vel_kmh: Math.round(d.max_vel_kmh * 10) / 10 })),
    };
  });
  players.sort((a, b) => a.full_name.localeCompare(b.full_name, "is"));

  return NextResponse.json({ from, to, players });
}

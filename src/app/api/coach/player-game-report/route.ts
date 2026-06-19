/**
 * /api/coach/player-game-report?player_id=…&season=2026
 *
 * GET — per-match physical performance report for one player (agent-facing):
 * GPS + IMA per league match, minutes-normalised to per-90, with season summary
 * and team benchmarks (team average + the player's percentile rank in the squad)
 * for each metric. Coach/staff only.
 *
 * Data join: match_schedule (opponent/competition/home) × match_player_minutes
 * (minutes) × player_external_load_daily (GPS + IMA, source='catapult') on
 * (player_id, date = match_date). Top speed (max_velocity) is ALREADY km/h in
 * the source — do NOT multiply by 3.6.
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

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;

// The cumulative per-match metrics we normalise to per-90. Top speed is a peak,
// handled separately (never divided by minutes).
const P90_KEYS = [
  "total_distance", "hsr", "sprint", "player_load",
  "accel", "decel", "ima_acc", "ima_dec", "cod", "jumps", "ima_hsr",
] as const;
type P90Key = (typeof P90_KEYS)[number];

type MatchMetrics = {
  total_distance: number; hsr: number; sprint: number; player_load: number;
  accel: number; decel: number; ima_acc: number; ima_dec: number;
  cod: number; jumps: number; ima_hsr: number; top_speed_kmh: number;
};

function loadRowToMetrics(r: Record<string, unknown>): MatchMetrics {
  return {
    total_distance: num(r.total_distance),
    hsr: num(r.high_speed_distance),
    sprint: num(r.sprint_distance),
    player_load: num(r.total_player_load),
    accel: r0(num(r.accelerations)),
    decel: r0(num(r.decelerations)),
    ima_acc: r0(num(r.ima_accel)),
    ima_dec: r0(num(r.ima_decel)),
    cod: r0(
      num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low) +
      num(r.ima_cod_right_high) + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low),
    ),
    jumps: r0(num(r.jumps)),
    ima_hsr: num(r.ima_fr_band58_total_distance),
    top_speed_kmh: (() => { const v = num(r.max_velocity); return v > 45 ? 0 : v; })(), // already km/h; drop >45 GPS glitches
  };
}

function per90(metrics: MatchMetrics, minutes: number): Record<P90Key, number> {
  const f = minutes > 0 ? 90 / minutes : 0;
  return {
    total_distance: r0(metrics.total_distance * f),
    hsr: r0(metrics.hsr * f),
    sprint: r0(metrics.sprint * f),
    player_load: r0(metrics.player_load * f),
    accel: r1(metrics.accel * f),
    decel: r1(metrics.decel * f),
    ima_acc: r1(metrics.ima_acc * f),
    ima_dec: r1(metrics.ima_dec * f),
    cod: r1(metrics.cod * f),
    jumps: r1(metrics.jumps * f),
    ima_hsr: r0(metrics.ima_hsr * f),
  };
}

const isoYear = (y: number) => ({ from: `${y}-01-01`, to: `${y}-12-31` });
function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

const MIN_QUALIFY_MINUTES = 20; // ignore cameo appearances in the benchmark
const LOAD_COLUMNS =
  "player_id, date, total_distance, high_speed_distance, sprint_distance, total_player_load, " +
  "accelerations, decelerations, max_velocity, ima_accel, ima_decel, " +
  "ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, " +
  "ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, " +
  "ima_fr_band58_total_distance, jumps";

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;

  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season")) || new Date().getUTCFullYear();
  const { from, to } = isoYear(season);

  // Lightweight roster-only call so the page can populate its player picker
  // before a player is chosen.
  if (url.searchParams.get("roster_only")) {
    const { data, error } = await supabase
      .from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const roster = ((data ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>)
      .map((p) => ({ id: p.id, full_name: (p.full_name ?? "—").trim(), position: p.position }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "is"));
    return NextResponse.json({ roster });
  }

  const playerId = url.searchParams.get("player_id");
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });

  // Squad (names + position + dob), match schedule, minutes, and GPS load —
  // four small queries assembled in JS (PostgREST joins across these are awkward).
  const [playersRes, scheduleRes, minutesRes] = await Promise.all([
    supabase.from("players").select("id, full_name, position, date_of_birth, is_active").eq("team_id", teamId),
    supabase.from("match_schedule").select("match_date, opponent, competition, is_home").eq("team_id", teamId).gte("match_date", from).lte("match_date", to),
    supabase.from("match_player_minutes").select("player_id, match_date, minutes_played, is_dnp").eq("team_id", teamId).gte("match_date", from).lte("match_date", to),
  ]);
  if (playersRes.error) return NextResponse.json({ error: playersRes.error.message }, { status: 500 });

  const players = (playersRes.data ?? []) as Array<{ id: string; full_name: string | null; position: string | null; date_of_birth: string | null; is_active: boolean | null }>;
  const target = players.find((p) => p.id === playerId);
  if (!target) return NextResponse.json({ error: "Player not on this team" }, { status: 404 });
  const playerIds = players.map((p) => p.id);

  // Only match dates are needed — fetching the whole season's daily load (every
  // training day for every player) blows past PostgREST's 1000-row default and
  // silently drops match rows. Restricting to match dates keeps it well bounded.
  const matchDates = Array.from(new Set([
    ...((minutesRes.data ?? []) as Array<{ match_date: string }>).map((m) => m.match_date),
    ...((scheduleRes.data ?? []) as Array<{ match_date: string }>).map((m) => m.match_date),
  ]));

  const { data: loadData, error: loadErr } = matchDates.length
    ? await supabase
        .from("player_external_load_daily")
        .select(LOAD_COLUMNS)
        .eq("source", "catapult")
        .in("player_id", playerIds)
        .in("date", matchDates)
        .limit(5000) // raise above PostgREST's 1000 default (match-dates × squad)
    : { data: [], error: null };
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });

  const scheduleByDate = new Map<string, { opponent: string | null; competition: string | null; is_home: boolean | null }>();
  for (const s of (scheduleRes.data ?? []) as Array<{ match_date: string; opponent: string | null; competition: string | null; is_home: boolean | null }>) {
    if (!scheduleByDate.has(s.match_date)) scheduleByDate.set(s.match_date, { opponent: s.opponent, competition: s.competition, is_home: s.is_home });
  }
  const loadByKey = new Map<string, Record<string, unknown>>();
  for (const r of (loadData ?? []) as unknown as Array<Record<string, unknown>>) {
    loadByKey.set(`${r.player_id}|${r.date}`, r);
  }

  // ── Per-appearance per-90 across the whole squad → benchmark distributions ──
  // One season per-90 AVERAGE per player (qualifying minutes only), so a player
  // is one data point per metric regardless of how many matches he played.
  const perPlayerP90Sums = new Map<string, { sums: Record<P90Key, number>; topSpeed: number; n: number }>();
  for (const m of (minutesRes.data ?? []) as Array<{ player_id: string; match_date: string; minutes_played: number | null; is_dnp: boolean | null }>) {
    if (m.is_dnp || !m.minutes_played || m.minutes_played < MIN_QUALIFY_MINUTES) continue;
    const load = loadByKey.get(`${m.player_id}|${m.match_date}`);
    if (!load) continue;
    const metrics = loadRowToMetrics(load);
    const p90 = per90(metrics, m.minutes_played);
    let acc = perPlayerP90Sums.get(m.player_id);
    if (!acc) {
      acc = { sums: Object.fromEntries(P90_KEYS.map((k) => [k, 0])) as Record<P90Key, number>, topSpeed: 0, n: 0 };
      perPlayerP90Sums.set(m.player_id, acc);
    }
    for (const k of P90_KEYS) acc.sums[k] += p90[k];
    acc.topSpeed = Math.max(acc.topSpeed, metrics.top_speed_kmh);
    acc.n += 1;
  }

  // Build the benchmark sample: each player's season average per-90 per metric.
  type Bench = { player: number; team_avg: number; percentile: number; rank: number; n: number };
  const benchKeys = [...P90_KEYS, "top_speed_kmh"] as const;
  type BenchKey = (typeof benchKeys)[number];
  const sampleByMetric = new Map<BenchKey, Array<{ id: string; value: number }>>();
  for (const k of benchKeys) sampleByMetric.set(k, []);
  for (const [id, acc] of perPlayerP90Sums.entries()) {
    if (acc.n === 0) continue;
    for (const k of P90_KEYS) sampleByMetric.get(k)!.push({ id, value: acc.sums[k] / acc.n });
    sampleByMetric.get("top_speed_kmh")!.push({ id, value: acc.topSpeed });
  }

  function benchmark(metric: BenchKey, playerValue: number | null): Bench | null {
    const sample = sampleByMetric.get(metric)!;
    if (!sample.length || playerValue == null) return null;
    const values = sample.map((s) => s.value);
    const teamAvg = values.reduce((a, b) => a + b, 0) / values.length;
    const below = values.filter((v) => v <= playerValue).length;
    const percentile = Math.round((below / values.length) * 100);
    const sorted = [...values].sort((a, b) => b - a);
    const rank = sorted.findIndex((v) => v <= playerValue) + 1; // 1 = best
    return { player: r1(playerValue), team_avg: r1(teamAvg), percentile, rank: rank || values.length, n: values.length };
  }

  // ── Target player's matches (chronological) ──
  const targetMinutes = ((minutesRes.data ?? []) as Array<{ player_id: string; match_date: string; minutes_played: number | null; is_dnp: boolean | null }>)
    .filter((m) => m.player_id === playerId && !m.is_dnp && (m.minutes_played ?? 0) > 0)
    .sort((a, b) => a.match_date.localeCompare(b.match_date));

  const matches = targetMinutes.map((m) => {
    const load = loadByKey.get(`${m.player_id}|${m.match_date}`);
    const sched = scheduleByDate.get(m.match_date);
    const metrics = load ? loadRowToMetrics(load) : null;
    return {
      date: m.match_date,
      opponent: sched?.opponent ?? null,
      competition: sched?.competition ?? null,
      is_home: sched?.is_home ?? null,
      minutes: m.minutes_played ?? 0,
      has_gps: !!load,
      raw: metrics,
      p90: metrics ? per90(metrics, m.minutes_played ?? 0) : null,
    };
  });

  // ── Season summary (player's own per-90 average + bests, GPS matches only) ──
  const gpsMatches = matches.filter((m) => m.has_gps && m.raw && m.minutes > 0);
  const acc = perPlayerP90Sums.get(playerId) ?? null; // qualifying-minutes average
  const seasonP90 = acc && acc.n > 0
    ? Object.fromEntries(P90_KEYS.map((k) => [k, r1(acc.sums[k] / acc.n)])) as Record<P90Key, number>
    : Object.fromEntries(P90_KEYS.map((k) => [k, 0])) as Record<P90Key, number>;
  const bestTopSpeed = gpsMatches.reduce((mx, m) => Math.max(mx, m.raw!.top_speed_kmh), 0);

  const benchmarks: Record<string, Bench | null> = {};
  for (const k of P90_KEYS) benchmarks[k] = benchmark(k, acc && acc.n > 0 ? acc.sums[k] / acc.n : null);
  benchmarks.top_speed_kmh = benchmark("top_speed_kmh", bestTopSpeed || null);

  return NextResponse.json({
    player: { id: target.id, full_name: (target.full_name ?? "—").trim(), position: target.position, age: ageFrom(target.date_of_birth) },
    season: { year: season, from, to },
    summary: {
      matches_played: targetMinutes.length,
      matches_with_gps: gpsMatches.length,
      total_minutes: targetMinutes.reduce((s, m) => s + (m.minutes_played ?? 0), 0),
      qualifying_matches: acc?.n ?? 0,
      per90_avg: seasonP90,
      best_top_speed_kmh: r1(bestTopSpeed),
    },
    benchmarks,
    matches,
    // Lightweight roster for the player picker (so the page can switch players).
    roster: players
      .filter((p) => p.is_active !== false || p.id === playerId)
      .map((p) => ({ id: p.id, full_name: (p.full_name ?? "—").trim(), position: p.position }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "is")),
  });
}

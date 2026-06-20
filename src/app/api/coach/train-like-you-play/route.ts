/**
 * /api/coach/train-like-you-play?season=2026
 *
 * "Train like you Play" preparedness, on the Football Movement Profile (FMP) +
 * IMA — the inertial signals (work indoors, capture dynamic multi-directional
 * movement, not just straight-line GPS speed). For every player, the best
 * training exposure to each match demand vs that player's own match demand, so
 * the coach sees who isn't trained for what matches require (Gabbett 2016
 * train-to-be-exposed; Malone 2018 high-speed exposure; Catapult FMP).
 *
 *   per-90 intensity = value / session minutes × 90
 *     match minutes  = minutes_played; training minutes = fmp_total_duration_s/60
 *     (session_duration_minutes is unrecorded on training days, but FMP carries
 *      its own duration — that's what makes this work)
 *   match demand   = mean per-90 across the player's match appearances
 *   train exposure = mean of the player's TOP-3 training sessions per-90
 *   pct            = train / match × 100   (top speed = max train / max match)
 *
 * max_velocity is already km/h; >45 = GPS glitch, ignored.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase } as const;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const plausibleKmh = (v: number) => (v > 45 ? 0 : v);
const MIN_MATCH_MIN = 20;
const MIN_TRAIN_SEC = 1200; // 20 min — a real session

type MetricKey =
  | "top_speed" | "fmp_run_high" | "fmp_dyn_high" | "fmp_dyn_med"
  | "ima_accel" | "ima_decel" | "ima_cod" | "ima_jumps";
// Superset of metrics computed once; the two MODES below pick which to display.
const METRICS: Array<{ key: MetricKey; kind: "per90" | "max" }> = [
  { key: "top_speed", kind: "max" },
  { key: "fmp_run_high", kind: "per90" }, { key: "fmp_dyn_high", kind: "per90" }, { key: "fmp_dyn_med", kind: "per90" },
  { key: "ima_accel", kind: "per90" }, { key: "ima_decel", kind: "per90" }, { key: "ima_cod", kind: "per90" }, { key: "ima_jumps", kind: "per90" },
];
// FMP = Catapult's movement-profile categories (time-in-zone). IMA = the raw
// inertial event counts (not bundled into FMP) — accel/decel, change-of-
// direction, jumps. (IMA band-3 high-intensity counts are ~0 on match files
// here, so they have no match demand to compare against — excluded.)
const MODES: Record<"fmp" | "ima", MetricKey[]> = {
  fmp: ["top_speed", "fmp_run_high", "fmp_dyn_high", "fmp_dyn_med", "ima_decel", "ima_cod"],
  ima: ["ima_accel", "ima_decel", "ima_cod", "ima_jumps"],
};

const LOAD_COLS =
  "player_id, date, max_velocity, fmp_total_duration_s, fmp_running_high_s, fmp_dynamic_high_s, fmp_dynamic_medium_s, " +
  "ima_accel, ima_decel, jumps, " +
  "ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low";

function rawMetric(r: Record<string, unknown>, key: MetricKey): number {
  switch (key) {
    case "top_speed": return plausibleKmh(num(r.max_velocity));
    case "fmp_run_high": return num(r.fmp_running_high_s);
    case "fmp_dyn_high": return num(r.fmp_dynamic_high_s);
    case "fmp_dyn_med": return num(r.fmp_dynamic_medium_s);
    case "ima_accel": return num(r.ima_accel);
    case "ima_decel": return num(r.ima_decel);
    case "ima_jumps": return num(r.jumps);
    case "ima_cod": return num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low) +
      num(r.ima_cod_right_high) + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low);
  }
}

async function fetchAllLoad(sb: SupabaseClient, playerIds: string[], from: string, to: string): Promise<Array<Record<string, unknown>>> {
  const PAGE = 1000;
  const out: Array<Record<string, unknown>> = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await sb.from("player_external_load_daily").select(LOAD_COLS)
      .eq("source", "catapult").in("player_id", playerIds).gte("date", from).lte("date", to)
      .order("date", { ascending: true }).range(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function topNMean(xs: number[], n: number): number | null {
  if (!xs.length) return null;
  return mean([...xs].sort((a, b) => b - a).slice(0, n));
}

// Under-exposure thresholds. <50% of match demand = Malone risk zone; top speed
// rarely exceeds match max, so reaching ≥85% of match max in training is healthy
// sprint exposure. Comparing best-training to match demand, so no overload end.
function flagFor(kind: "per90" | "max", pct: number | null): "under" | "gap" | "ok" | "none" {
  if (pct == null) return "none";
  if (kind === "max") return pct < 70 ? "under" : pct < 85 ? "gap" : "ok";
  return pct < 50 ? "under" : pct < 80 ? "gap" : "ok";
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
// Microcycle day label: recovery days (≤3 after a match) → MD+n; otherwise count
// down to the next match (MD-1..MD-5). Days in long fixture gaps → off-cycle (null).
function mdDayLabel(date: string, matchesAsc: string[]): string | null {
  let next: string | null = null, last: string | null = null;
  for (const m of matchesAsc) if (m > date) { next = m; break; }
  for (let i = matchesAsc.length - 1; i >= 0; i--) if (matchesAsc[i] < date) { last = matchesAsc[i]; break; }
  const toNext = next ? daysBetween(date, next) : null;
  const since = last ? daysBetween(last, date) : null;
  if (since != null && since <= 3 && (toNext == null || since <= toNext)) return `MD+${since}`;
  if (toNext != null && toNext <= 5) return `MD-${toNext}`;
  if (since != null && since <= 3) return `MD+${since}`;
  return null;
}
const MICRO_ORDER = ["MD+1", "MD+2", "MD+3", "MD-5", "MD-4", "MD-3", "MD-2", "MD-1"];

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;

  const season = Number(new URL(req.url).searchParams.get("season")) || new Date().getUTCFullYear();
  const from = `${season}-01-01`, to = `${season}-12-31`;

  const [playersRes, minutesRes, scheduleRes] = await Promise.all([
    supabase.from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true),
    supabase.from("match_player_minutes").select("player_id, match_date, minutes_played, is_dnp").eq("team_id", teamId).gte("match_date", from).lte("match_date", to),
    supabase.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", from).lte("match_date", to),
  ]);
  if (playersRes.error) return NextResponse.json({ error: playersRes.error.message }, { status: 500 });

  const players = (playersRes.data ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>;
  const playerIds = players.map((p) => p.id);
  if (!playerIds.length) return NextResponse.json({ season, metrics: METRICS, players: [] });

  const matchMinByKey = new Map<string, number>();
  const matchDates = new Set<string>();
  for (const m of (minutesRes.data ?? []) as Array<{ player_id: string; match_date: string; minutes_played: number | null; is_dnp: boolean | null }>) {
    matchDates.add(m.match_date);
    if (!m.is_dnp && (m.minutes_played ?? 0) >= MIN_MATCH_MIN) matchMinByKey.set(`${m.player_id}|${m.match_date}`, m.minutes_played ?? 0);
  }
  for (const s of (scheduleRes.data ?? []) as Array<{ match_date: string }>) matchDates.add(s.match_date);
  const matchesAsc = Array.from(matchDates).sort();

  let load: Array<Record<string, unknown>>;
  try { load = await fetchAllLoad(supabase, playerIds, from, to); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Load fetch failed" }, { status: 500 }); }

  const byPlayer = new Map<string, Array<Record<string, unknown>>>();
  for (const r of load) { const id = String(r.player_id); if (!byPlayer.has(id)) byPlayer.set(id, []); byPlayer.get(id)!.push(r); }

  const matchDemandByPlayer = new Map<string, Record<string, number | null>>();
  const out = players.map((p) => {
    const rows = byPlayer.get(p.id) ?? [];
    const matchRows = rows.filter((r) => matchMinByKey.has(`${p.id}|${String(r.date)}`));
    // Training = non-match catapult days with a real FMP session length.
    const trainRows = rows.filter((r) => !matchDates.has(String(r.date)) && num(r.fmp_total_duration_s) >= MIN_TRAIN_SEC);

    const metrics: Record<string, { match: number | null; train: number | null; pct: number | null; flag: string }> = {};
    let gaps = 0;
    for (const m of METRICS) {
      let matchVal: number | null, trainVal: number | null;
      if (m.kind === "max") {
        const mv = matchRows.map((r) => rawMetric(r, m.key)).filter((v) => v > 0);
        const tv = trainRows.map((r) => rawMetric(r, m.key)).filter((v) => v > 0);
        matchVal = mv.length ? Math.max(...mv) : null;
        trainVal = tv.length ? Math.max(...tv) : null;
      } else {
        const mv = matchRows.map((r) => { const min = matchMinByKey.get(`${p.id}|${String(r.date)}`) ?? 0; return min > 0 ? rawMetric(r, m.key) / min * 90 : null; }).filter((v): v is number => v != null && v > 0);
        const tv = trainRows.map((r) => { const min = num(r.fmp_total_duration_s) / 60; return min > 0 ? rawMetric(r, m.key) / min * 90 : null; }).filter((v): v is number => v != null && v > 0);
        matchVal = mean(mv);
        trainVal = topNMean(tv, 3);
      }
      const pct = matchVal != null && matchVal > 0 && trainVal != null ? Math.round((trainVal / matchVal) * 100) : null;
      const flag = flagFor(m.kind, pct);
      if (flag === "under") gaps++;
      metrics[m.key] = { match: matchVal == null ? null : Math.round(matchVal * 10) / 10, train: trainVal == null ? null : Math.round(trainVal * 10) / 10, pct, flag };
    }
    matchDemandByPlayer.set(p.id, Object.fromEntries(METRICS.map((m) => [m.key, metrics[m.key].match])));
    return { id: p.id, name: (p.full_name ?? "—").trim(), position: p.position, match_appearances: matchRows.length, train_sessions: trainRows.length, metrics, gaps };
  })
    .filter((p) => p.match_appearances > 0)
    .sort((a, b) => b.gaps - a.gaps || a.name.localeCompare(b.name, "is"));

  // ── Microcycle: average training intensity as % of match demand per MD-day ──
  // (periodization shape — is MD-3 a high day? is MD-1 a taper? Martin-García 2018)
  const micro = new Map<string, { sessions: number; sums: Record<string, number>; counts: Record<string, number> }>();
  for (const r of load) {
    const date = String(r.date);
    if (matchDates.has(date) || num(r.fmp_total_duration_s) < MIN_TRAIN_SEC) continue;
    const label = mdDayLabel(date, matchesAsc);
    if (!label) continue;
    const demand = matchDemandByPlayer.get(String(r.player_id));
    if (!demand) continue;
    let b = micro.get(label);
    if (!b) { b = { sessions: 0, sums: {}, counts: {} }; micro.set(label, b); }
    b.sessions++;
    for (const m of METRICS) {
      const dem = demand[m.key];
      if (dem == null || dem <= 0) continue;
      const val = m.kind === "max" ? rawMetric(r, m.key) : rawMetric(r, m.key) / (num(r.fmp_total_duration_s) / 60) * 90;
      if (!(val > 0)) continue;
      b.sums[m.key] = (b.sums[m.key] ?? 0) + (val / dem) * 100;
      b.counts[m.key] = (b.counts[m.key] ?? 0) + 1;
    }
  }
  const microcycle = MICRO_ORDER.filter((l) => micro.has(l)).map((l) => {
    const b = micro.get(l)!;
    const metrics: Record<string, number | null> = {};
    for (const m of METRICS) metrics[m.key] = b.counts[m.key] ? Math.round(b.sums[m.key] / b.counts[m.key]) : null;
    return { md_day: l, sessions: b.sessions, metrics };
  });

  return NextResponse.json({ season, metrics: METRICS, modes: MODES, players: out, microcycle });
}

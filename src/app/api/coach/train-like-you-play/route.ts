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
import { positionGroup } from "@/lib/micropulse/positionStyle";

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
  | "ima_accel" | "ima_decel" | "ima_cod" | "ima_jumps"
  | "decel_eff" | "sprint_eff" | "hsr_dist"
  | "player_load" | "pl_per_min";
// kind: per90 = cumulative, normalised to /90; max = a peak (top speed);
// rate = already per-minute (PL/min) — compared raw, never re-divided by time.
type MetricKind = "per90" | "max" | "rate";
// Superset of metrics computed once; the MODES below pick which to display.
const METRICS: Array<{ key: MetricKey; kind: MetricKind }> = [
  { key: "top_speed", kind: "max" },
  { key: "fmp_run_high", kind: "per90" }, { key: "fmp_dyn_high", kind: "per90" }, { key: "fmp_dyn_med", kind: "per90" },
  { key: "ima_accel", kind: "per90" }, { key: "ima_decel", kind: "per90" }, { key: "ima_cod", kind: "per90" }, { key: "ima_jumps", kind: "per90" },
  // Core / Lite (no FMP, no IMA): GPS + Gen2 effort signals every Catapult tier has.
  { key: "decel_eff", kind: "per90" }, { key: "sprint_eff", kind: "per90" }, { key: "hsr_dist", kind: "per90" },
  // Volume + work-rate (every tier): Player Load per-90, and PL/min as a rate.
  { key: "player_load", kind: "per90" }, { key: "pl_per_min", kind: "rate" },
];
// FMP = Catapult's movement-profile categories (time-in-zone). IMA = raw inertial
// event counts. CORE = the GPS/Gen2-effort signals available on every tier (no
// FMP/IMA needed) — for Lengjudeild/Core clubs. The page picks whichever mode the
// club actually has data for.
const MODES: Record<"fmp" | "ima" | "core", MetricKey[]> = {
  fmp: ["top_speed", "fmp_run_high", "fmp_dyn_high", "fmp_dyn_med", "ima_decel", "ima_cod", "player_load", "pl_per_min"],
  ima: ["ima_accel", "ima_decel", "ima_cod", "ima_jumps"],
  core: ["top_speed", "hsr_dist", "sprint_eff", "decel_eff", "player_load", "pl_per_min"],
};

const LOAD_COLS =
  "player_id, date, max_velocity, fmp_total_duration_s, fmp_running_high_s, fmp_dynamic_high_s, fmp_dynamic_medium_s, " +
  "ima_accel, ima_decel, jumps, " +
  "ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, " +
  "accel_decel_efforts, velocity_band6_total_efforts_gen2, high_speed_distance, total_player_load, player_load_per_minute";

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
    case "decel_eff": return num(r.accel_decel_efforts);
    case "sprint_eff": return num(r.velocity_band6_total_efforts_gen2);
    case "hsr_dist": return num(r.high_speed_distance);
    case "player_load": return num(r.total_player_load);
    case "pl_per_min": return num(r.player_load_per_minute);
  }
}

// Training-session duration (seconds). Pro clubs carry FMP total duration; Core
// clubs don't, so derive it from total Player Load ÷ Player Load/min — PL/min is
// *defined* as Player Load per minute, so the quotient is the session minutes.
// Lets TLYP normalise training per-90 without FMP. (Matches use real minutes.)
function trainDurationSec(r: Record<string, unknown>): number {
  const fmp = num(r.fmp_total_duration_s);
  if (fmp >= MIN_TRAIN_SEC) return fmp;
  const tpl = num(r.total_player_load), plpm = num(r.player_load_per_minute);
  return tpl > 0 && plpm > 0 ? (tpl / plpm) * 60 : 0;
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
function flagFor(kind: MetricKind, pct: number | null): "under" | "gap" | "ok" | "none" {
  if (pct == null) return "none";
  if (kind === "max") return pct < 70 ? "under" : pct < 85 ? "gap" : "ok";
  return pct < 50 ? "under" : pct < 80 ? "gap" : "ok";
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
// Microcycle day label: recovery days (≤3 after a match) → MD+n; otherwise count
// down to the next match (MD-1..MD-5). Days in long fixture gaps → off-cycle (null).
// Returns the MD-day label AND the resolved preceding match date, so the
// microcycle loop can classify a post-match session's cohort without re-scanning.
function mdDayLabel(date: string, matchesAsc: string[]): { label: string | null; lastMatch: string | null } {
  let next: string | null = null, last: string | null = null;
  for (const m of matchesAsc) if (m > date) { next = m; break; }
  for (let i = matchesAsc.length - 1; i >= 0; i--) if (matchesAsc[i] < date) { last = matchesAsc[i]; break; }
  const toNext = next ? daysBetween(date, next) : null;
  const since = last ? daysBetween(last, date) : null;
  if (since != null && since <= 3 && (toNext == null || since <= toNext)) return { label: `MD+${since}`, lastMatch: last };
  if (toNext != null && toNext <= 5) return { label: `MD-${toNext}`, lastMatch: last };
  if (since != null && since <= 3) return { label: `MD+${since}`, lastMatch: last };
  return { label: null, lastMatch: last };
}
const MICRO_ORDER = ["MD+1", "MD+2", "MD+3", "MD-5", "MD-4", "MD-3", "MD-2", "MD-1"];
// Days whose squad is two populations: players who played the preceding match
// (recovery) vs those who didn't (compensatory top-up). MD+3 onward re-converge.
const COHORT_SPLIT_DAYS = new Set(["MD+1", "MD+2"]);
// Post-match cohort thresholds — tunable references, not rules (Anderson 2016;
// Hills 2018; Stevens 2017; Nédélec 2012).
const RECOVERY_MIN_MINUTES = 60; // played a substantial share → recovery
const TOPUP_MAX_MINUTES = 30;    // played little/none → needs a full top-up
type Cohort = "recovery" | "topup" | "partial";
// Classify a player's cohort from his minutes in the preceding match. `partial`
// (30–59 min) is a real third state; it folds into TOP-UP, not recovery — the
// Recovery band is sized for full starters, and a partial appearance still needs
// a compensatory top-up (validated on Breiðablik: folding partial into recovery
// inflated MD+1 Recovery from a true 44% to a misleading 76%). The enum is kept
// so a minutes-scaled third band can be added later.
function cohortFor(row: { minutes: number; dnp: boolean } | undefined): Cohort {
  if (!row || row.dnp || row.minutes < TOPUP_MAX_MINUTES) return "topup";
  if (row.minutes >= RECOVERY_MIN_MINUTES) return "recovery";
  return "partial";
}

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
  // Full per-(player, match) minutes incl. DNP / low minutes — for cohort split.
  const minuteRowByKey = new Map<string, { minutes: number; dnp: boolean }>();
  const matchDates = new Set<string>();
  for (const m of (minutesRes.data ?? []) as Array<{ player_id: string; match_date: string; minutes_played: number | null; is_dnp: boolean | null }>) {
    matchDates.add(m.match_date);
    minuteRowByKey.set(`${m.player_id}|${m.match_date}`, { minutes: m.minutes_played ?? 0, dnp: !!m.is_dnp });
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
    // Training = non-match catapult days with a real session length (FMP duration
    // for Pro, or Player-Load-derived duration for Core/Lite — see trainDurationSec).
    const trainRows = rows.filter((r) => !matchDates.has(String(r.date)) && trainDurationSec(r) >= MIN_TRAIN_SEC);

    const metrics: Record<string, { match: number | null; train: number | null; pct: number | null; flag: string }> = {};
    let gaps = 0;
    for (const m of METRICS) {
      let matchVal: number | null, trainVal: number | null;
      if (m.kind === "max") {
        const mv = matchRows.map((r) => rawMetric(r, m.key)).filter((v) => v > 0);
        const tv = trainRows.map((r) => rawMetric(r, m.key)).filter((v) => v > 0);
        matchVal = mv.length ? Math.max(...mv) : null;
        trainVal = tv.length ? Math.max(...tv) : null;
      } else if (m.kind === "rate") {
        // Already per-minute (PL/min) — compare raw, no per-90 scaling.
        const mv = matchRows.map((r) => rawMetric(r, m.key)).filter((v) => v > 0);
        const tv = trainRows.map((r) => rawMetric(r, m.key)).filter((v) => v > 0);
        matchVal = mean(mv);
        trainVal = topNMean(tv, 3);
      } else {
        const mv = matchRows.map((r) => { const min = matchMinByKey.get(`${p.id}|${String(r.date)}`) ?? 0; return min > 0 ? rawMetric(r, m.key) / min * 90 : null; }).filter((v): v is number => v != null && v > 0);
        const tv = trainRows.map((r) => { const min = trainDurationSec(r) / 60; return min > 0 ? rawMetric(r, m.key) / min * 90 : null; }).filter((v): v is number => v != null && v > 0);
        matchVal = mean(mv);
        trainVal = topNMean(tv, 3);
      }
      const pct = matchVal != null && matchVal > 0 && trainVal != null ? Math.round((trainVal / matchVal) * 100) : null;
      const flag = flagFor(m.kind, pct);
      if (flag === "under") gaps++;
      metrics[m.key] = { match: matchVal == null ? null : Math.round(matchVal * 10) / 10, train: trainVal == null ? null : Math.round(trainVal * 10) / 10, pct, flag };
    }
    matchDemandByPlayer.set(p.id, Object.fromEntries(METRICS.map((m) => [m.key, metrics[m.key].match])));
    return { id: p.id, name: (p.full_name ?? "—").trim(), position: p.position, group: positionGroup(p.position), match_appearances: matchRows.length, train_sessions: trainRows.length, metrics, gaps };
  })
    .filter((p) => p.match_appearances > 0)
    .sort((a, b) => b.gaps - a.gaps || a.name.localeCompare(b.name, "is"));

  // ── Microcycle: average training intensity as % of match demand per MD-day ──
  // (periodization shape — is MD-3 a high day? is MD-1 a taper? Martin-García 2018)
  type MicroBucket = { sessions: number; sums: Record<string, number>; counts: Record<string, number> };
  const newBucket = (): MicroBucket => ({ sessions: 0, sums: {}, counts: {} });
  const addToBucket = (map: Map<string, MicroBucket>, key: string, r: Record<string, unknown>, demand: Record<string, number | null>) => {
    let b = map.get(key);
    if (!b) { b = newBucket(); map.set(key, b); }
    b.sessions++;
    for (const m of METRICS) {
      const dem = demand[m.key];
      if (dem == null || dem <= 0) continue;
      const val = m.kind === "max" || m.kind === "rate" ? rawMetric(r, m.key) : rawMetric(r, m.key) / (trainDurationSec(r) / 60) * 90;
      if (!(val > 0)) continue;
      b.sums[m.key] = (b.sums[m.key] ?? 0) + (val / dem) * 100;
      b.counts[m.key] = (b.counts[m.key] ?? 0) + 1;
    }
  };
  const metricsOf = (b: MicroBucket): Record<string, number | null> =>
    Object.fromEntries(METRICS.map((m) => [m.key, b.counts[m.key] ? Math.round(b.sums[m.key] / b.counts[m.key]) : null]));

  const micro = new Map<string, MicroBucket>();           // combined squad series, by label
  const microCohort = new Map<string, MicroBucket>();      // `${label}|${recovery|topup}` for split days
  for (const r of load) {
    const date = String(r.date);
    if (matchDates.has(date) || trainDurationSec(r) < MIN_TRAIN_SEC) continue;
    const { label, lastMatch } = mdDayLabel(date, matchesAsc);
    if (!label) continue;
    const pid = String(r.player_id);
    const demand = matchDemandByPlayer.get(pid);
    if (!demand) continue;
    addToBucket(micro, label, r, demand);
    // MD+1 / MD+2: bucket by whether the player played a full shift (recovery) or
    // not (top-up). `partial` (30–59 min) folds into top-up.
    if (COHORT_SPLIT_DAYS.has(label) && lastMatch) {
      const bucket = cohortFor(minuteRowByKey.get(`${pid}|${lastMatch}`)) === "recovery" ? "recovery" : "topup";
      addToBucket(microCohort, `${label}|${bucket}`, r, demand);
    }
  }
  const microcycle = MICRO_ORDER.filter((l) => micro.has(l)).map((l) => {
    const base = { md_day: l, sessions: micro.get(l)!.sessions, metrics: metricsOf(micro.get(l)!) };
    if (!COHORT_SPLIT_DAYS.has(l)) return base;
    const rec = microCohort.get(`${l}|recovery`);
    const top = microCohort.get(`${l}|topup`);
    const cohorts: Record<string, { sessions: number; metrics: Record<string, number | null> }> = {};
    if (rec) cohorts.recovery = { sessions: rec.sessions, metrics: metricsOf(rec) };
    if (top) cohorts.topup = { sessions: top.sessions, metrics: metricsOf(top) };
    return Object.keys(cohorts).length ? { ...base, cohorts } : base;
  });

  // Position-group match demand: the average match per-90 of the group's
  // players per metric — the position-specific standard to train toward
  // (ties this to the Position Comparison profiles).
  const groupDemand: Record<string, Record<string, number | null>> = {};
  const groupMembers = new Map<string, string[]>();
  for (const p of out) { if (!groupMembers.has(p.group)) groupMembers.set(p.group, []); groupMembers.get(p.group)!.push(p.id); }
  for (const [g, ids] of groupMembers.entries()) {
    const dem: Record<string, number | null> = {};
    for (const m of METRICS) {
      const vals = ids.map((id) => matchDemandByPlayer.get(id)?.[m.key]).filter((v): v is number => v != null && v > 0);
      dem[m.key] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
    }
    groupDemand[g] = dem;
  }

  return NextResponse.json({ season, metrics: METRICS, modes: MODES, players: out, microcycle, groupDemand });
}

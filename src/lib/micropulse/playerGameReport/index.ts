/**
 * playerGameReport — per-match physical performance report for ONE player:
 * GPS + IMA per league match, minutes-normalised to per-90, with a season summary
 * and squad benchmarks (team average + the player's percentile rank). Capability-
 * aware (availableKeys drops empty metrics, so Lite/Core surfaces efforts/hml and
 * Pro surfaces the IMA columns). Extracted so the coach report and the player's
 * own report (self-scoped) share one source of truth.
 *
 * Data join: match_schedule (opponent/competition/home) × match_player_minutes
 * (minutes) × player_external_load_daily (GPS + IMA, source='catapult') on
 * (player_id, date = match_date). Top speed (max_velocity) is ALREADY km/h.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sprintDistanceM } from "@/lib/micropulse/catapultCapability";

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r0 = (v: number) => Math.round(v);
const r1 = (v: number) => Math.round(v * 10) / 10;

export const MIN_QUALIFY_MINUTES = 20; // ignore cameo appearances in the benchmark

export const P90_KEYS = [
  "total_distance", "hsr", "sprint", "player_load",
  "accel", "decel", "ima_acc", "ima_dec", "cod", "jumps", "ima_hsr",
  "ima_hir5", "ima_hir6", "ima_hir7", "ima_hir8",
  "efforts", "hml",
] as const;
export type P90Key = (typeof P90_KEYS)[number];

type MatchMetrics = {
  total_distance: number; hsr: number; sprint: number; player_load: number;
  accel: number; decel: number; ima_acc: number; ima_dec: number;
  cod: number; jumps: number; ima_hsr: number; top_speed_kmh: number;
  ima_hir5: number; ima_hir6: number; ima_hir7: number; ima_hir8: number;
  efforts: number; hml: number;
};

const LOAD_COLUMNS =
  "player_id, date, total_distance, high_speed_distance, sprint_distance, total_player_load, " +
  "accelerations, decelerations, max_velocity, ima_accel, ima_decel, " +
  "ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, " +
  "ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, " +
  "ima_fr_band58_total_distance, ima_fr_band5_total_distance, ima_fr_band6_total_distance, " +
  "ima_fr_band7_total_distance, ima_fr_band8_total_distance, " +
  "jumps, accel_decel_efforts, high_metabolic_load_distance_m, session_duration_minutes, velocity_band6_total_distance, player_load_per_minute, raw_payload_json";

function loadRowToMetrics(r: Record<string, unknown>): MatchMetrics {
  return {
    total_distance: num(r.total_distance),
    hsr: num(r.high_speed_distance),
    // Sprint distance = the V6 (top-speed) velocity band (empty sprint_distance
    // on Lite units). Shared helper so every surface resolves it identically.
    sprint: sprintDistanceM(r),
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
    // High-intensity running broken into Catapult stride-rate bands 5-8 (rising
    // intensity) — the IMA analogue of GPS velocity bands V5/V6.
    ima_hir5: num(r.ima_fr_band5_total_distance),
    ima_hir6: num(r.ima_fr_band6_total_distance),
    ima_hir7: num(r.ima_fr_band7_total_distance),
    ima_hir8: num(r.ima_fr_band8_total_distance),
    top_speed_kmh: (() => { const v = num(r.max_velocity); return v > 45 ? 0 : v; })(),
    efforts: r0(num(r.accel_decel_efforts)),
    hml: num(r.high_metabolic_load_distance_m),
  };
}

function per90(metrics: MatchMetrics, minutes: number): Record<P90Key, number> {
  const f = minutes > 0 ? 90 / minutes : 0;
  return {
    total_distance: r0(metrics.total_distance * f), hsr: r0(metrics.hsr * f), sprint: r0(metrics.sprint * f),
    player_load: r0(metrics.player_load * f), accel: r1(metrics.accel * f), decel: r1(metrics.decel * f),
    ima_acc: r1(metrics.ima_acc * f), ima_dec: r1(metrics.ima_dec * f), cod: r1(metrics.cod * f),
    jumps: r1(metrics.jumps * f), ima_hsr: r0(metrics.ima_hsr * f),
    ima_hir5: r0(metrics.ima_hir5 * f), ima_hir6: r0(metrics.ima_hir6 * f), ima_hir7: r0(metrics.ima_hir7 * f), ima_hir8: r0(metrics.ima_hir8 * f),
    efforts: r1(metrics.efforts * f), hml: r0(metrics.hml * f),
  };
}

// ── Form lens ────────────────────────────────────────────────────────────────
// "How is he RIGHT NOW" — the recent window vs his season baseline, the one
// dimension a season aggregate can't show. Pure + client-callable (no DB).

export type FormDir = "up" | "flat" | "down";
export type FormMetric = { key: string; recent: number; season: number; deltaPct: number; dir: FormDir };
export type FormResult = { windowN: number; totalGps: number; metrics: FormMetric[]; up: number; down: number; verdict: FormDir };

const FORM_THRESHOLD = 0.07; // ±7% vs season avg before calling it up/down
// Running-output metrics assessed for form (all live in the per-match p90; top
// speed is excluded — it's a peak, not a per-90 average).
export const FORM_KEYS = ["total_distance", "hsr", "sprint", "efforts", "hml", "ima_acc", "ima_dec", "cod"] as const;

/**
 * Compare a player's last `windowSize` GPS matches to his season per-90 average,
 * per metric, and roll up to an overall verdict. Returns null when there aren't
 * enough matches to read a trend (needs >= 5 GPS matches).
 */
export function computeForm(
  matches: Array<{ has_gps?: boolean; p90?: Record<string, number> | null }>,
  seasonAvg: Record<string, number>,
  availableKeys: string[],
  windowSize = 3,
): FormResult | null {
  const gps = matches.filter((m) => m.has_gps && m.p90);
  if (gps.length < 5) return null;
  const recent = gps.slice(-windowSize);
  const metrics: FormMetric[] = (FORM_KEYS as readonly string[])
    .filter((k) => availableKeys.includes(k))
    .map((key) => {
      const recentAvg = recent.reduce((s, m) => s + ((m.p90?.[key] as number) ?? 0), 0) / recent.length;
      const season = seasonAvg[key] ?? 0;
      const deltaPct = season > 0 ? (recentAvg - season) / season : 0;
      const dir: FormDir = deltaPct > FORM_THRESHOLD ? "up" : deltaPct < -FORM_THRESHOLD ? "down" : "flat";
      return { key, recent: r1(recentAvg), season: r1(season), deltaPct, dir };
    })
    .filter((m) => m.season > 0);
  if (!metrics.length) return null;
  const up = metrics.filter((m) => m.dir === "up").length;
  const down = metrics.filter((m) => m.dir === "down").length;
  const verdict: FormDir = up >= down + 1 && up >= 2 ? "up" : down >= up + 1 && down >= 2 ? "down" : "flat";
  return { windowN: recent.length, totalGps: gps.length, metrics, up, down, verdict };
}

export const isoYear = (y: number) => ({ from: `${y}-01-01`, to: `${y}-12-31` });
export function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

export type PlayerRow = { id: string; full_name: string | null; position: string | null; date_of_birth: string | null; is_active: boolean | null };

/** Self-contained roster for a team (player picker / list). */
export async function rosterForTeam(supabase: SupabaseClient, teamId: string) {
  const { data, error } = await supabase
    .from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>)
    .map((p) => ({ id: p.id, full_name: (p.full_name ?? "—").trim(), position: p.position }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "is"));
}

export type GameReport = {
  player: { id: string; full_name: string; position: string | null; age: number | null };
  season: { year: number; from: string; to: string };
  summary: { matches_played: number; matches_with_gps: number; total_minutes: number; qualifying_matches: number; per90_avg: Record<P90Key, number>; best_top_speed_kmh: number };
  benchmarks: Record<string, { player: number; team_avg: number; percentile: number; rank: number; n: number } | null>;
  availableKeys: string[];
  matches: Array<Record<string, unknown>>;
};

type ComputeResult =
  | { ok: true; report: GameReport; players: PlayerRow[] }
  | { ok: false; error: string; status: number };

/**
 * Build one player's season game report, scoped to their team for the squad
 * benchmarks. Caller supplies a service-role client + a verified teamId/playerId.
 */
export async function computePlayerGameReport(
  supabase: SupabaseClient, teamId: string, playerId: string, season: number,
): Promise<ComputeResult> {
  const { from, to } = isoYear(season);

  const [playersRes, scheduleRes, minutesRes] = await Promise.all([
    supabase.from("players").select("id, full_name, position, date_of_birth, is_active").eq("team_id", teamId),
    supabase.from("match_schedule").select("match_date, opponent, competition, is_home").eq("team_id", teamId).gte("match_date", from).lte("match_date", to),
    supabase.from("match_player_minutes").select("player_id, match_date, minutes_played, is_dnp").eq("team_id", teamId).gte("match_date", from).lte("match_date", to),
  ]);
  if (playersRes.error) return { ok: false, error: playersRes.error.message, status: 500 };

  const players = (playersRes.data ?? []) as PlayerRow[];
  const target = players.find((p) => p.id === playerId);
  if (!target) return { ok: false, error: "Player not on this team", status: 404 };
  const playerIds = players.map((p) => p.id);

  // A real match needs an opponent. Ignore schedule rows without one (they're
  // training/test days mistakenly added to the schedule) so they never appear as
  // phantom "—" matches. Manual-minute dates are always intentional, so kept.
  const matchDates = Array.from(new Set([
    ...((minutesRes.data ?? []) as Array<{ match_date: string }>).map((m) => m.match_date),
    ...((scheduleRes.data ?? []) as Array<{ match_date: string; opponent: string | null }>)
      .filter((m) => (m.opponent ?? "").trim() !== "")
      .map((m) => m.match_date),
  ]));

  const { data: loadData, error: loadErr } = matchDates.length
    ? await supabase.from("player_external_load_daily").select(LOAD_COLUMNS)
        .eq("source", "catapult").in("player_id", playerIds).in("date", matchDates).limit(5000)
    : { data: [], error: null };
  if (loadErr) return { ok: false, error: loadErr.message, status: 500 };

  const scheduleByDate = new Map<string, { opponent: string | null; competition: string | null; is_home: boolean | null }>();
  for (const s of (scheduleRes.data ?? []) as Array<{ match_date: string; opponent: string | null; competition: string | null; is_home: boolean | null }>) {
    if (!scheduleByDate.has(s.match_date)) scheduleByDate.set(s.match_date, { opponent: s.opponent, competition: s.competition, is_home: s.is_home });
  }
  const loadByKey = new Map<string, Record<string, unknown>>();
  for (const r of (loadData ?? []) as unknown as Array<Record<string, unknown>>) loadByKey.set(`${r.player_id}|${r.date}`, r);

  // Manual minutes (authoritative) keyed player|date.
  const manualMin = new Map<string, { minutes: number; dnp: boolean }>();
  for (const m of (minutesRes.data ?? []) as Array<{ player_id: string; match_date: string; minutes_played: number | null; is_dnp: boolean | null }>) {
    manualMin.set(`${m.player_id}|${m.match_date}`, { minutes: m.minutes_played ?? 0, dnp: !!m.is_dnp });
  }
  // Resolve a player's minutes for a match date: a manual entry if present (and
  // not a DNP), otherwise the Catapult session duration. The duration fallback
  // lets Core/Lite teams that only upload GPS get the report WITHOUT entering
  // minutes by hand — match DATES still come from match_schedule (Week-Setup);
  // the GPS feed just supplies how long each player was on the pitch.
  // Resolve minutes. Priority: manual entry, else a sane session_duration (some
  // clubs, e.g. Afturelding, store it in SECONDS — normalise), else the exact
  // duration implied by player_load_per_minute (some clubs, e.g. HK, send that
  // but not session_duration). Short appearances are kept; only implausibly long
  // values (glitches / un-normalisable seconds) are dropped.
  const MAX_MIN = 200;
  const resolveMinutes = (pid: string, date: string, load: Record<string, unknown> | undefined): number => {
    const man = manualMin.get(`${pid}|${date}`);
    if (man) return man.dnp ? 0 : (man.minutes || 0);
    if (!load) return 0;
    let sdm = num(load.session_duration_minutes);
    if (sdm > MAX_MIN && sdm / 60 > 0) sdm = sdm / 60; // stored as seconds
    if (sdm > 0 && sdm <= MAX_MIN) return sdm;
    const plpm = num(load.player_load_per_minute);
    const pl = num(load.total_player_load);
    const derived = plpm > 0 && pl > 0 ? pl / plpm : 0;
    return derived > 0 && derived <= MAX_MIN ? derived : 0;
  };

  // "Forgot pod?" estimates are excluded from all baselines/benchmarks/PBs so an
  // estimate can never feed a percentile, a season best, or a future estimate.
  const isEstimated = (load: Record<string, unknown> | undefined): boolean =>
    !!(load?.raw_payload_json as { estimated?: boolean } | null)?.estimated;

  const perPlayerP90Sums = new Map<string, { sums: Record<P90Key, number>; topSpeed: number; n: number }>();
  for (const date of matchDates) {
    for (const pid of playerIds) {
      const load = loadByKey.get(`${pid}|${date}`);
      if (!load || isEstimated(load)) continue; // squad benchmark needs a REAL GPS row
      const minutes = resolveMinutes(pid, date, load);
      if (minutes < MIN_QUALIFY_MINUTES) continue;
      const metrics = loadRowToMetrics(load);
      const p90 = per90(metrics, minutes);
      let acc = perPlayerP90Sums.get(pid);
      if (!acc) { acc = { sums: Object.fromEntries(P90_KEYS.map((k) => [k, 0])) as Record<P90Key, number>, topSpeed: 0, n: 0 }; perPlayerP90Sums.set(pid, acc); }
      for (const k of P90_KEYS) acc.sums[k] += p90[k];
      acc.topSpeed = Math.max(acc.topSpeed, metrics.top_speed_kmh);
      acc.n += 1;
    }
  }

  const benchKeys = [...P90_KEYS, "top_speed_kmh"] as const;
  type BenchKey = (typeof benchKeys)[number];
  const sampleByMetric = new Map<BenchKey, Array<{ id: string; value: number }>>();
  for (const k of benchKeys) sampleByMetric.set(k, []);
  for (const [id, acc] of perPlayerP90Sums.entries()) {
    if (acc.n === 0) continue;
    for (const k of P90_KEYS) sampleByMetric.get(k)!.push({ id, value: acc.sums[k] / acc.n });
    sampleByMetric.get("top_speed_kmh")!.push({ id, value: acc.topSpeed });
  }

  function benchmark(metric: BenchKey, playerValue: number | null) {
    const sample = sampleByMetric.get(metric)!;
    if (!sample.length || playerValue == null) return null;
    const values = sample.map((s) => s.value);
    const teamAvg = values.reduce((a, b) => a + b, 0) / values.length;
    const below = values.filter((v) => v <= playerValue).length;
    const percentile = Math.round((below / values.length) * 100);
    const sorted = [...values].sort((a, b) => b - a);
    const rank = sorted.findIndex((v) => v <= playerValue) + 1;
    return { player: r1(playerValue), team_avg: r1(teamAvg), percentile, rank: rank || values.length, n: values.length };
  }

  // The target player's matches: every match date where his minutes resolve to
  // > 0 (manual entry, or a Catapult session that day for Core/Lite teams).
  const matches = matchDates
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((date) => {
      const load = loadByKey.get(`${playerId}|${date}`);
      const minutes = resolveMinutes(playerId, date, load);
      if (minutes <= 0) return null;
      const sched = scheduleByDate.get(date);
      const metrics = load ? loadRowToMetrics(load) : null;
      return {
        date, opponent: sched?.opponent ?? null, competition: sched?.competition ?? null,
        is_home: sched?.is_home ?? null, minutes: Math.round(minutes), has_gps: !!load,
        estimated: isEstimated(load),
        raw: metrics, p90: metrics ? per90(metrics, minutes) : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const gpsMatches = matches.filter((m) => m.has_gps && m.raw && m.minutes > 0);
  const acc = perPlayerP90Sums.get(playerId) ?? null;
  const seasonP90 = acc && acc.n > 0
    ? Object.fromEntries(P90_KEYS.map((k) => [k, r1(acc.sums[k] / acc.n)])) as Record<P90Key, number>
    : Object.fromEntries(P90_KEYS.map((k) => [k, 0])) as Record<P90Key, number>;
  // Season-best top speed excludes estimates — a PB must be a real measurement.
  const bestTopSpeed = gpsMatches.filter((m) => !m.estimated).reduce((mx, m) => Math.max(mx, m.raw!.top_speed_kmh), 0);

  const benchmarks: GameReport["benchmarks"] = {};
  for (const k of P90_KEYS) benchmarks[k] = benchmark(k, acc && acc.n > 0 ? acc.sums[k] / acc.n : null);
  benchmarks.top_speed_kmh = benchmark("top_speed_kmh", bestTopSpeed || null);

  const availableKeys = benchKeys.filter((k) => (sampleByMetric.get(k) ?? []).some((s) => s.value > 0));

  return {
    ok: true,
    players,
    report: {
      player: { id: target.id, full_name: (target.full_name ?? "—").trim(), position: target.position, age: ageFrom(target.date_of_birth) },
      season: { year: season, from, to },
      summary: {
        matches_played: matches.length, matches_with_gps: gpsMatches.length,
        total_minutes: matches.reduce((s, m) => s + m.minutes, 0),
        qualifying_matches: acc?.n ?? 0, per90_avg: seasonP90, best_top_speed_kmh: r1(bestTopSpeed),
      },
      benchmarks, availableKeys, matches,
    },
  };
}

/**
 * Match Movement — the "driver" companion to GPS match comparison.
 *
 * GPS volume (distance, HSR) is usually similar match-to-match; what changes is
 * HOW a player moved (Niklas Virtanen: GPS = engine, IMA = driver). This computes
 * a per-player, per-match "movement fingerprint", normalised per minute so
 * matches of different length compare fairly. One engine feeds all three views:
 *   1. a player vs his own match-average (how was this match different?)
 *   2. match A vs match B (side by side)
 *   3. the whole squad in one match (who moved how)
 *
 * Two variants, chosen from what the club's data actually contains:
 *   • ima  (Pro/ELITE) — the true inertial driver: accel:decel balance, change of
 *     direction, L/R asymmetry, stride cadence. Citations: McBurnie 2022, di
 *     Prampero 2015, Buchheit 2014 norms.
 *   • gps  (Core/Lite) — Lite units capture no IMA, so the fingerprint is built
 *     from GPS movement signals (player load, accel/decel efforts, high-speed +
 *     sprint running, top speed). A GPS movement read, not the inertial driver.
 */

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { oneRowPerPlayerDate } from "@/lib/micropulse/load/oneRowPerDate";
import type { MovementFingerprint, MatchMovementRow, MatchMovementResult, SubBands, MovementVariant } from "./types";
import { EMPTY_SUB, movementDimensions } from "./types";

// Re-export the client-safe types + dimension metadata from one place. The UI
// imports directly from ./types to avoid pulling this server module in.
export * from "./types";

type RawRow = {
  player_id: string;
  date: string;
  source?: string | null;
  // IMA (Pro/ELITE)
  ima_total: number | null;
  ima_accel: number | null;
  ima_decel: number | null;
  ima_cod_left_high: number | null; ima_cod_left_medium: number | null; ima_cod_left_low: number | null;
  ima_cod_right_high: number | null; ima_cod_right_medium: number | null; ima_cod_right_low: number | null;
  ima_fr_band6_stride_count: number | null; ima_fr_band7_stride_count: number | null; ima_fr_band8_stride_count: number | null;
  ima_band1_decel_count: number | null; ima_band2_decel_count: number | null; ima_band3_decel_count: number | null;
  // GPS (Core/Lite fallback)
  total_player_load: number | null;
  accel_decel_efforts: number | null;
  high_speed_distance: number | null;
  velocity_band6_total_distance: number | null;
  sprint_distance: number | null;
  max_velocity: number | null;
  // Minutes fallback when a team hasn't hand-entered match minutes.
  session_duration_minutes: number | null;
  player_load_per_minute: number | null;
  raw_payload_json: { estimated?: boolean } | null;
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const perMin = (v: number, min: number): number | null => (min > 0 ? v / min : null);

const EMPTY_RAW: MatchMovementRow["raw"] = { imaTotal: null, codTotal: null, codLeft: null, codRight: null, hiCadence: null };

function imaFingerprintOf(row: RawRow, minutes: number): { fp: MovementFingerprint; raw: MatchMovementRow["raw"]; sub: SubBands } {
  const codLeft = n(row.ima_cod_left_high) + n(row.ima_cod_left_medium) + n(row.ima_cod_left_low);
  const codRight = n(row.ima_cod_right_high) + n(row.ima_cod_right_medium) + n(row.ima_cod_right_low);
  const codTotal = codLeft + codRight;
  const hiCadence = n(row.ima_fr_band6_stride_count) + n(row.ima_fr_band7_stride_count) + n(row.ima_fr_band8_stride_count);
  return {
    fp: {
      totalPerMin: row.ima_total == null ? null : perMin(n(row.ima_total), minutes),
      accelDecelRatio: ratio(n(row.ima_accel), n(row.ima_decel)),
      codPerMin: codTotal > 0 ? perMin(codTotal, minutes) : null,
      codLeftPct: codTotal > 0 ? (100 * codLeft) / codTotal : null,
      hiCadencePerMin: perMin(hiCadence, minutes),
    },
    raw: {
      imaTotal: row.ima_total ?? null,
      codTotal: codTotal || null,
      codLeft: codTotal > 0 ? codLeft : null,
      codRight: codTotal > 0 ? codRight : null,
      hiCadence: hiCadence || null,
    },
    sub: {
      decelLow: row.ima_band1_decel_count ?? null,
      decelMed: row.ima_band2_decel_count ?? null,
      decelHigh: row.ima_band3_decel_count ?? null,
      stride6: row.ima_fr_band6_stride_count ?? null,
      stride7: row.ima_fr_band7_stride_count ?? null,
      stride8: row.ima_fr_band8_stride_count ?? null,
      codHigh: codTotal > 0 ? n(row.ima_cod_left_high) + n(row.ima_cod_right_high) : null,
      codMed: codTotal > 0 ? n(row.ima_cod_left_medium) + n(row.ima_cod_right_medium) : null,
      codLow: codTotal > 0 ? n(row.ima_cod_left_low) + n(row.ima_cod_right_low) : null,
    },
  };
}

/** GPS movement fingerprint (Core/Lite) — no IMA, so no sub-band depth. */
function gpsFingerprintOf(row: RawRow, minutes: number): { fp: MovementFingerprint; raw: MatchMovementRow["raw"]; sub: SubBands } {
  const load = n(row.total_player_load);
  const efforts = n(row.accel_decel_efforts);
  const hsr = n(row.high_speed_distance);
  const sprint = n(row.velocity_band6_total_distance) || n(row.sprint_distance);
  const topRaw = n(row.max_velocity);
  const top = topRaw > 0 && topRaw <= 45 ? topRaw : 0; // guard GPS-glitch spikes
  return {
    fp: {
      workPerMin: load > 0 ? perMin(load, minutes) : null,
      effortsPerMin: efforts > 0 ? perMin(efforts, minutes) : null,
      hsrPerMin: hsr > 0 ? perMin(hsr, minutes) : null,
      sprintPerMin: sprint > 0 ? perMin(sprint, minutes) : null,
      topSpeed: top > 0 ? top : null,
    },
    raw: EMPTY_RAW,
    sub: EMPTY_SUB,
  };
}

/** True when a GPS row carries at least one usable movement signal. */
function gpsHasData(row: RawRow): boolean {
  return n(row.total_player_load) > 0 || n(row.accel_decel_efforts) > 0 || n(row.high_speed_distance) > 0 ||
    n(row.velocity_band6_total_distance) > 0 || n(row.sprint_distance) > 0 || n(row.max_velocity) > 0;
}

const LOAD_COLS =
  "player_id, date, source, ima_total, ima_accel, ima_decel, " +
  "ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, " +
  "ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, " +
  "ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count, " +
  "ima_band1_decel_count, ima_band2_decel_count, ima_band3_decel_count, " +
  "total_player_load, accel_decel_efforts, high_speed_distance, " +
  "velocity_band6_total_distance, sprint_distance, max_velocity, session_duration_minutes, player_load_per_minute, raw_payload_json";

/** Minimum minutes for a match to count — below this the per-minute rates are noisy. */
const MIN_MINUTES = 20;
/** Upper bound for a plausible match/session duration (guards seconds-vs-minutes + glitches). */
const MAX_MATCH_MINUTES = 200;

const emptyResult = (teamId: string): MatchMovementResult =>
  ({ teamId, variant: "ima", matchDates: [], rows: [], playerAverages: {}, subAverages: {}, players: [] });

export async function computeMatchMovement(args: { teamId: string; sinceDays?: number }): Promise<MatchMovementResult> {
  const { teamId, sinceDays = 400 } = args;
  const sb = getSupabaseAdmin();

  const { data: pl } = await sb.from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true);
  const players = ((pl ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>);
  const nameById = new Map(players.map((p) => [p.id, { name: p.full_name ?? "—", position: p.position ?? null }]));
  const playerIds = players.map((p) => p.id);
  if (playerIds.length === 0) return emptyResult(teamId);

  const since = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - sinceDays);
    return d.toISOString().slice(0, 10);
  })();

  // Match DATES = fixtures (Week-Setup / match_schedule) ∪ any hand-entered
  // minutes. Minutes themselves fall back to the Catapult session duration, so a
  // Core/Lite team that just sets its fixtures gets Match Movement WITHOUT
  // entering minutes by hand (mirrors the player game report).
  const [schedRes, minRes] = await Promise.all([
    sb.from("match_schedule").select("match_date, opponent").eq("team_id", teamId).gte("match_date", since),
    sb.from("match_player_minutes").select("player_id, match_date, minutes_played, is_dnp").eq("team_id", teamId).gte("match_date", since),
  ]);
  const matchDateSet = new Set<string>();
  // A real match needs an opponent — ignore opponent-less schedule rows (training/
  // test days mistakenly added) so they can't become phantom matches.
  for (const s of ((schedRes.data ?? []) as Array<{ match_date: string; opponent: string | null }>)) {
    if ((s.opponent ?? "").trim() !== "") matchDateSet.add(s.match_date);
  }
  const manualMin = new Map<string, { minutes: number; dnp: boolean }>();
  for (const m of ((minRes.data ?? []) as Array<{ player_id: string; match_date: string; minutes_played: number | null; is_dnp: boolean | null }>)) {
    matchDateSet.add(m.match_date);
    manualMin.set(`${m.player_id}|${m.match_date}`, { minutes: m.minutes_played ?? 0, dnp: !!m.is_dnp });
  }
  const matchDates = Array.from(matchDateSet).sort();
  if (matchDates.length === 0) return emptyResult(teamId);

  // Catapult load rows for those match dates.
  const { data: extData } = await sb
    .from("player_external_load_daily")
    .select(LOAD_COLS)
    .in("source", ["catapult", "manual"])
    .in("player_id", playerIds)
    .in("date", matchDates);
  // One effective row per (player, match date): a coach's manual GPS entry
  // overrides the catapult reading for that day.
  const ext = oneRowPerPlayerDate((extData ?? []) as unknown as RawRow[]);

  // Resolve a player's minutes for a match date: a manual entry if present (and
  // not a DNP), otherwise the Catapult session duration. Keep only appearances
  // with enough minutes for the per-minute rates to be stable.
  // Resolve plausible match minutes. Priority: a manual entry, else a sane
  // session_duration (some clubs, e.g. Afturelding, store it in SECONDS —
  // normalise), else the exact duration implied by player_load_per_minute (some
  // clubs, e.g. HK, send that but not session_duration). Anything outside a sane
  // match window is treated as unusable so a bad row can't distort per-min rates.
  const resolveMinutes = (row: RawRow): number => {
    const man = manualMin.get(`${row.player_id}|${row.date}`);
    if (man) return man.dnp ? 0 : man.minutes || 0;
    let sdm = n(row.session_duration_minutes);
    if (sdm > MAX_MATCH_MINUTES && sdm / 60 >= MIN_MINUTES) sdm = sdm / 60; // stored as seconds
    if (sdm >= MIN_MINUTES && sdm <= MAX_MATCH_MINUTES) return sdm;
    const plpm = n(row.player_load_per_minute);
    const load = n(row.total_player_load);
    const derived = plpm > 0 && load > 0 ? load / plpm : 0;
    return derived >= MIN_MINUTES && derived <= MAX_MATCH_MINUTES ? derived : 0;
  };
  const appearances = ext
    .map((row) => ({ row, minutes: Math.round(resolveMinutes(row)) }))
    .filter((x) => x.minutes >= MIN_MINUTES);

  // Variant: prefer the true IMA driver when the club broadly captures it; fall
  // back to the GPS movement read for Core/Lite. "Broadly" = at least half of
  // match appearances carry IMA (mixed-tier teams tip to whichever dominates).
  const imaCount = appearances.filter((x) => n(x.row.ima_total) > 0).length;
  const gpsCount = appearances.filter((x) => gpsHasData(x.row)).length;
  const variant: MovementVariant =
    imaCount > 0 && imaCount >= Math.ceil(appearances.length * 0.5) ? "ima" : gpsCount > 0 ? "gps" : "ima";

  const rows: MatchMovementRow[] = [];
  for (const { row, minutes } of appearances) {
    const meta = nameById.get(row.player_id);
    if (!meta) continue;
    const estimated = !!row.raw_payload_json?.estimated;
    if (variant === "ima") {
      if (row.ima_total == null) continue; // no IMA captured
      const { fp, raw, sub } = imaFingerprintOf(row, minutes);
      rows.push({ player_id: row.player_id, name: meta.name, position: meta.position, match_date: row.date, minutes, estimated, fingerprint: fp, raw, sub });
    } else {
      if (!gpsHasData(row)) continue; // no GPS movement signal captured
      const { fp, raw, sub } = gpsFingerprintOf(row, minutes);
      rows.push({ player_id: row.player_id, name: meta.name, position: meta.position, match_date: row.date, minutes, estimated, fingerprint: fp, raw, sub });
    }
  }

  // Per-player averages (the "norm") — mean of each dimension across their matches.
  const dimKeys = movementDimensions(variant).map((d) => d.key);
  const byPlayer = new Map<string, MatchMovementRow[]>();
  for (const r of rows) {
    const arr = byPlayer.get(r.player_id) ?? [];
    arr.push(r);
    byPlayer.set(r.player_id, arr);
  }
  const playerAverages: Record<string, MovementFingerprint> = {};
  const subAverages: Record<string, SubBands> = {};
  const playerList: MatchMovementResult["players"] = [];
  const SUB_KEYS: Array<keyof SubBands> = ["decelLow", "decelMed", "decelHigh", "stride6", "stride7", "stride8", "codHigh", "codMed", "codLow"];
  for (const [pid, prs] of byPlayer) {
    // The "norm" excludes estimates so an estimate never feeds a player's baseline.
    const realPrs = prs.filter((r) => !r.estimated);
    const normPrs = realPrs.length ? realPrs : prs;
    const mean = (key: string): number | null => {
      const vals = normPrs.map((r) => r.fingerprint[key]).filter((v): v is number => v != null);
      return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
    };
    playerAverages[pid] = Object.fromEntries(dimKeys.map((k) => [k, mean(k)])) as MovementFingerprint;
    const subMean = (key: keyof SubBands): number | null => {
      const vals = normPrs.map((r) => r.sub[key]).filter((v): v is number => v != null);
      return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
    };
    subAverages[pid] = Object.fromEntries(SUB_KEYS.map((k) => [k, subMean(k)])) as SubBands;
    const meta = nameById.get(pid);
    playerList.push({ player_id: pid, name: meta?.name ?? "—", position: meta?.position ?? null, matches: prs.length });
  }
  playerList.sort((a, b) => a.name.localeCompare(b.name));

  // Only surface match dates that actually have movement data. A future fixture
  // (now that Week Setup / Fixtures write ahead-of-time match_schedule rows) or a
  // past match with no usable GPS must not appear as a selectable-but-empty match
  // — that was showing an empty squad table when the UI defaulted to the latest
  // (future) fixture.
  const matchDatesWithData = matchDates.filter((d) => rows.some((r) => r.match_date === d));

  return { teamId, variant, matchDates: matchDatesWithData, rows, playerAverages, subAverages, players: playerList };
}

/**
 * Long continuous runs — the IMA Free Running bands read as what they are: BOUT-DURATION bands
 * (confirmed by Catapult support, Nov 2026: "effort length bands in terms of duration (secs)")
 * (seconds of one continuous run; Breiðablik's OpenField bounds 0–8–12–15–18–21–24–27–100 s, see
 * docs/ima-free-running-bands.md). "Long runs" = runs of 18 s or more: bands 5–8 under the legacy edges,
 * bands 6–8 under the edges Breiðablik set on 9 Nov 2026 (0-2.5-5-8-12-18-24-30-1000). Every function reads
 * the row's own `ima_fr_band_bounds` (boundsOfRow), so rows classified with different edges are never mixed up.
 *
 * Bouts (event counts) and time in band come from the inertial sensor, so they exist INDOORS too; distance
 * in band needs GPS and is null, not 0, when the session had none. Stride rate is strides ÷ time, never the
 * stored per-band average (zeros from bands without a bout pull that average down).
 *
 * Pace (Nov 2026): the bands say how LONG a run was, not how fast. In a match almost every long run is at match
 * pace (Breiðablik: 14.1 of 15.5 at 11 km/h+, average 12.2 km/h); on a training day almost none are (0.7 of 5.6,
 * average 9.0 km/h: warm-up laps, jogging back between drills). So a long run counts as running LOAD only at
 * match pace (`matchPace`, MATCH_PACE_FLOOR_KMH); the jogs stay visible but never judge, target or alarm
 * (docs/ima-free-running-bands.md, "Pace: match pace vs jog").
 *
 * Pure, IO-free. Descriptive — never the readiness colour.
 */
import { bandsAtOrAbove, boundsOfRow, deriveFreeRunningBands, type FreeRunningBandRow } from "@/lib/integrations/catapult/freeRunningBands";

/** A long run = one continuous run of at least this many seconds (a band edge in every Breiðablik config). */
export const LONG_RUN_MIN_S = 18;

/** Band numbers holding runs ≥18 s for this row's edges (legacy 5–8, Nov-2026 config 6–8). */
export function longRunBandNumbers(row: FreeRunningBandRow): number[] {
  return bandsAtOrAbove(boundsOfRow(row), LONG_RUN_MIN_S) ?? [];
}

export type LongRuns = {
  /** Number of runs of ≥18 s. Null when the row carries no bout counts. */
  bouts: number | null;
  /** Seconds spent in those runs. */
  seconds: number | null;
  /** seconds ÷ bouts. */
  meanBoutS: number | null;
  /** The longest band (band number under the row's edges) with at least one run; null without bouts. */
  longestBand: number | null;
  /** Strides taken in those runs. */
  strides: number | null;
  /** Metres covered in those runs — GPS only; null when the session had no distance. */
  distanceM: number | null;
  /** distanceM ÷ strides — GPS only. */
  metresPerStride: number | null;
  /** strides ÷ seconds × 60. */
  strideRatePerMin: number | null;
  /** The long runs at match pace (`matchPaceOf`). Null = pace unknown (no GPS distance, e.g. indoors). */
  matchPace: MatchPaceRuns | null;
};

/**
 * A long run counts as running load at or above this pace (km/h): the slowest tenth of Breiðablik's own match
 * long runs is 11.2 km/h, training long runs average 9.0. A team can set its own in
 * `team_settings.fr_match_pace_floor_kmh` (the database trigger reads it).
 */
export const MATCH_PACE_FLOOR_KMH = 11;

/** The long runs (≥18 s) run at match pace. Zero values = GPS present and every long run was slower. */
export type MatchPaceRuns = { bouts: number; seconds: number; distanceM: number; strides: number };

const num = (v: unknown): number | null => { const n = typeof v === "string" ? Number(v) : v; return typeof n === "number" && Number.isFinite(n) ? n : null; };
const sumOrNull = (vals: Array<number | null>): number | null => { const v = vals.filter((x): x is number => x != null); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
const ratio = (a: number | null, b: number | null): number | null => (a != null && b != null && b > 0 ? a / b : null);

/** Did the session have a GPS reading? Indoors the pod records Player Load and IMA but no distance. */
export const hasGpsReading = (row: FreeRunningBandRow): boolean => (num(row.total_distance) ?? 0) > 0;

/**
 * The long runs at match pace in one row. Reads the stored `ima_fr_ge18_mp_*` columns (filled by the database
 * trigger with the team's floor); without them it sums this row's long bands whose average pace (distance ÷ time)
 * is at or above `floorKmh`, the same rule as the trigger. Null when the pace can't be known: no GPS distance
 * (indoors), no long-run reading, or edges that fit no known config.
 */
export function matchPaceOf(row: FreeRunningBandRow, floorKmh: number = MATCH_PACE_FLOOR_KMH): MatchPaceRuns | null {
  const stored = num(row.ima_fr_ge18_mp_event_count);
  if (stored != null) {
    return {
      bouts: stored,
      seconds: num(row.ima_fr_ge18_mp_total_duration) ?? 0,
      distanceM: num(row.ima_fr_ge18_mp_total_distance) ?? 0,
      strides: num(row.ima_fr_ge18_mp_stride_count) ?? 0,
    };
  }
  if (!hasGpsReading(row) || row.ima_fr_bounds_source === "unknown") return null;
  const bands = longRunBandNumbers(row);
  const col = (band: number, k: string) => num(row[`ima_fr_band${band}_${k}`]);
  if (!bands.length || bands.every((b) => col(b, "event_count") == null)) return null;
  const out: MatchPaceRuns = { bouts: 0, seconds: 0, distanceM: 0, strides: 0 };
  for (const b of bands) {
    const dur = col(b, "total_duration") ?? 0;
    const dist = col(b, "total_distance") ?? 0;
    if (dur > 0 && dist > 0 && (dist / dur) * 3.6 >= floorKmh) {
      out.bouts += col(b, "event_count") ?? 0;
      out.seconds += dur;
      out.distanceM += dist;
      out.strides += col(b, "stride_count") ?? 0;
    }
  }
  return out;
}

/**
 * Long-run LOAD of one row: the number every plan, target, ramp and review compares (load plan, progressive
 * overload, post-training planned vs actual, the periodization hub's match unit and day targets). Metres in long
 * runs at match pace; only when the pace can't be known (the match-pace column is null: indoors, no reading)
 * does it fall back to all long-run metres, the same rule as Unfamiliar load. 0 = GPS present and every long
 * run was a jog, a real value.
 */
export function longRunLoadMetres(row: { ima_fr_ge18_mp_total_distance?: unknown; ima_fr_band58_total_distance?: unknown } | Record<string, unknown>): number | null {
  return num(row.ima_fr_ge18_mp_total_distance) ?? num(row.ima_fr_band58_total_distance);
}

/** Strides in long runs at match pace (same rule as `longRunLoadMetres`; falls back to all ≥18 s strides). */
export function longRunLoadStrides(row: { ima_fr_ge18_mp_stride_count?: unknown; ima_fr_ge18_stride_count?: unknown } | Record<string, unknown>): number | null {
  return num(row.ima_fr_ge18_mp_stride_count) ?? num(row.ima_fr_ge18_stride_count);
}

/** The columns `longRunLoadMetres` / `longRunLoadStrides` read, for a Supabase select list. */
export const LONG_RUN_LOAD_COLS = "ima_fr_ge18_mp_total_distance, ima_fr_ge18_mp_stride_count";

/** The long runs of one `player_external_load_daily` row (snake_case columns). */
export function longRunsOf(row: FreeRunningBandRow): LongRuns {
  const col = (band: number, k: string) => num(row[`ima_fr_band${band}_${k}`]);
  const bands = longRunBandNumbers(row);
  // Prefer the sync's config-aware ≥18 s tier columns; fall back to summing this row's long bands.
  const tier = (k: string) => num(row[`ima_fr_ge18_${k}`]) ?? sumOrNull(bands.map((b) => col(b, k)));
  const bouts = tier("event_count");
  const seconds = tier("total_duration");
  const strides = tier("stride_count");
  const gps = hasGpsReading(row);
  const distanceM = gps ? (num(row.ima_fr_ge18_total_distance) ?? num(row.ima_fr_band58_total_distance) ?? sumOrNull(bands.map((b) => col(b, "total_distance")))) : null;
  const withRuns = bands.filter((b) => (col(b, "event_count") ?? 0) > 0);
  return {
    bouts, seconds,
    meanBoutS: ratio(seconds, bouts),
    longestBand: withRuns.length ? withRuns[withRuns.length - 1] : null,
    strides, distanceM,
    metresPerStride: ratio(distanceM, strides),
    strideRatePerMin: seconds != null && seconds > 0 && strides != null ? (strides / seconds) * 60 : null,
    matchPace: matchPaceOf(row),
  };
}

/** One long-run band (≥18 s) of one row, or a sum of rows: the four OpenField variables side by side. */
export type LongRunBand = {
  band: number;
  /** Bout-length bounds in seconds, e.g. [18, 21]; the last band's upper bound is open. */
  boundsS: [number, number];
  /** Event Count: runs in this band. */
  bouts: number | null;
  /** Total Duration (s). */
  seconds: number | null;
  /** seconds ÷ bouts — should sit inside the band. */
  meanBoutS: number | null;
  /** Total Distance (m) — GPS only; null indoors. */
  distanceM: number | null;
  /** Stride Count. */
  strides: number | null;
  /** distanceM ÷ strides — GPS only. */
  metresPerStride: number | null;
};

/**
 * The long-run bands (≥18 s) of one row as lines (Event Count · Total Duration · Total Distance · Stride Count),
 * using the row's own edges (4 lines under the legacy edges, 3 under the Nov-2026 ones). Same GPS rule as
 * `longRunsOf`: without a GPS reading the distance is null.
 */
export function longRunBandsOf(row: FreeRunningBandRow, bounds: readonly number[] = boundsOfRow(row)): LongRunBand[] {
  const gps = hasGpsReading(row);
  const derived = deriveFreeRunningBands(row, bounds);
  return (bandsAtOrAbove(bounds, LONG_RUN_MIN_S) ?? []).map((b) => {
    const d = derived[b - 1];
    const distanceM = gps ? d.distanceM : null;
    return {
      band: b, boundsS: d.boundsS, bouts: d.bouts, seconds: d.durationS,
      meanBoutS: ratio(d.durationS, d.bouts), distanceM, strides: d.strides,
      metresPerStride: ratio(distanceM, d.strides),
    };
  });
}

/**
 * Add band lines across players (or days). Lines are matched by their run-length bounds (not band number), so
 * rows classified with different edges never get added into the same line. A sum skips missing values; distance
 * sums only the lines that have it, and m/stride is taken over those same lines so indoor players don't shorten it.
 */
export function sumLongRunBands(lists: LongRunBand[][]): LongRunBand[] {
  const keyOf = (x: LongRunBand) => `${x.boundsS[0]}-${x.boundsS[1]}`;
  const keys = new Map<string, LongRunBand>();
  for (const l of lists) for (const x of l) if (!keys.has(keyOf(x))) keys.set(keyOf(x), x);
  const ordered = Array.from(keys.values()).sort((a, b) => a.boundsS[0] - b.boundsS[0]);
  return ordered.map((proto) => {
    const lines = lists.flat().filter((x) => keyOf(x) === keyOf(proto));
    const bouts = sumOrNull(lines.map((x) => x.bouts));
    const seconds = sumOrNull(lines.map((x) => x.seconds));
    const withDist = lines.filter((x) => x.distanceM != null);
    const distanceM = sumOrNull(withDist.map((x) => x.distanceM));
    const stridesWithDist = sumOrNull(withDist.map((x) => x.strides));
    return {
      band: proto.band, boundsS: proto.boundsS,
      bouts, seconds, meanBoutS: ratio(seconds, bouts), distanceM,
      strides: sumOrNull(lines.map((x) => x.strides)),
      metresPerStride: ratio(distanceM, stridesWithDist),
    };
  });
}

/** The "all long runs" line under a band table: bands added up; m/stride over the bands that have distance. */
export function longRunBandsTotal(bands: LongRunBand[]): Omit<LongRunBand, "band" | "boundsS"> {
  const bouts = sumOrNull(bands.map((x) => x.bouts));
  const seconds = sumOrNull(bands.map((x) => x.seconds));
  const withDist = bands.filter((x) => x.distanceM != null);
  const distanceM = sumOrNull(withDist.map((x) => x.distanceM));
  return {
    bouts, seconds, meanBoutS: ratio(seconds, bouts), distanceM,
    strides: sumOrNull(bands.map((x) => x.strides)),
    metresPerStride: ratio(distanceM, sumOrNull(withDist.map((x) => x.strides))),
  };
}

/**
 * Are this club's Free Running bands time bands? True when, across the rows, most bands with runs have a mean
 * bout length inside the band's bounds (`deriveFreeRunningBands`). Null when no row carries bout counts.
 * Another club may have set the bands up differently in OpenField; then the labels here don't apply.
 */
export function bandsAreTimeBands(rows: FreeRunningBandRow[], bounds?: readonly number[]): boolean | null {
  let ok = 0, n = 0;
  for (const row of rows) for (const b of deriveFreeRunningBands(row, bounds ?? boundsOfRow(row))) {
    if (b.boutLengthConsistent == null || (b.bouts ?? 0) < 1) continue;
    n += 1; if (b.boutLengthConsistent) ok += 1;
  }
  return n === 0 ? null : ok / n >= 0.6;
}

export const LONG_RUN_CITATIONS = [
  "Catapult IMA Free Running: bands are effort-duration bands in seconds (Catapult support, Nov 2026); edges per team/date in team_fr_band_config — docs/ima-free-running-bands.md",
  "McBurnie et al. 2022 — stride length and high-speed running mechanics",
  "Morin et al. 2011 — stride length as a component of running speed",
];

/**
 * Long continuous runs — the IMA Free Running bands read as what they are: BOUT-DURATION bands
 * (seconds of one continuous run; Breiðablik's OpenField bounds 0–8–12–15–18–21–24–27–100 s, see
 * docs/ima-free-running-bands.md). Bands 5–8 are runs of 18 s or more: "long runs".
 *
 * Bouts (event counts) and time in band come from the inertial sensor, so they exist INDOORS too; distance
 * in band needs GPS and is null, not 0, when the session had none. Stride rate is strides ÷ time, never the
 * stored per-band average (zeros from bands without a bout pull that average down).
 *
 * Pure, IO-free. Descriptive — never the readiness colour.
 */
import { DEFAULT_FR_BAND_BOUNDS_S, deriveFreeRunningBands, type FreeRunningBandRow } from "@/lib/integrations/catapult/freeRunningBands";

export const LONG_RUN_BANDS = [5, 6, 7, 8] as const;
/** A long run = one continuous run of at least this many seconds (the lower bound of band 5). */
export const LONG_RUN_MIN_S: number = DEFAULT_FR_BAND_BOUNDS_S[4];

export type LongRuns = {
  /** Number of runs of ≥18 s (bands 5–8 event counts). Null when the row carries no bout counts. */
  bouts: number | null;
  /** Seconds spent in those runs. */
  seconds: number | null;
  /** seconds ÷ bouts. */
  meanBoutS: number | null;
  /** The longest band (5–8) with at least one run; null without bouts. */
  longestBand: number | null;
  /** Strides taken in those runs (bands 5–8). */
  strides: number | null;
  /** Metres covered in those runs — GPS only; null when the session had no distance. */
  distanceM: number | null;
  /** distanceM ÷ strides — GPS only. */
  metresPerStride: number | null;
  /** strides ÷ seconds × 60. */
  strideRatePerMin: number | null;
};

const num = (v: unknown): number | null => { const n = typeof v === "string" ? Number(v) : v; return typeof n === "number" && Number.isFinite(n) ? n : null; };
const sumOrNull = (vals: Array<number | null>): number | null => { const v = vals.filter((x): x is number => x != null); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
const ratio = (a: number | null, b: number | null): number | null => (a != null && b != null && b > 0 ? a / b : null);

/** Did the session have a GPS reading? Indoors the pod records Player Load and IMA but no distance. */
export const hasGpsReading = (row: FreeRunningBandRow): boolean => (num(row.total_distance) ?? 0) > 0;

/** The long runs of one `player_external_load_daily` row (snake_case columns). */
export function longRunsOf(row: FreeRunningBandRow): LongRuns {
  const col = (band: number, k: string) => num(row[`ima_fr_band${band}_${k}`]);
  const bouts = sumOrNull(LONG_RUN_BANDS.map((b) => col(b, "event_count")));
  const seconds = sumOrNull(LONG_RUN_BANDS.map((b) => col(b, "total_duration")));
  const strides = sumOrNull(LONG_RUN_BANDS.map((b) => col(b, "stride_count")));
  const gps = hasGpsReading(row);
  const distanceM = gps ? (num(row.ima_fr_band58_total_distance) ?? sumOrNull(LONG_RUN_BANDS.map((b) => col(b, "total_distance")))) : null;
  const withRuns = LONG_RUN_BANDS.filter((b) => (col(b, "event_count") ?? 0) > 0);
  return {
    bouts, seconds,
    meanBoutS: ratio(seconds, bouts),
    longestBand: withRuns.length ? withRuns[withRuns.length - 1] : null,
    strides, distanceM,
    metresPerStride: ratio(distanceM, strides),
    strideRatePerMin: seconds != null && seconds > 0 && strides != null ? (strides / seconds) * 60 : null,
  };
}

/** One long-run band (5–8) of one row, or a sum of rows: the four OpenField variables side by side. */
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
 * Bands 5–8 of one row as four lines (Event Count · Total Duration · Total Distance · Stride Count). The same GPS
 * rule as `longRunsOf`: without a GPS reading the distance is null, so the bands always sum to `longRunsOf`.
 */
export function longRunBandsOf(row: FreeRunningBandRow, bounds: readonly number[] = DEFAULT_FR_BAND_BOUNDS_S): LongRunBand[] {
  const gps = hasGpsReading(row);
  const derived = deriveFreeRunningBands(row, bounds);
  return LONG_RUN_BANDS.map((b) => {
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
 * Add band lines across players (or days). A sum skips missing values; distance sums only the lines that have it,
 * and m/stride is then taken over those same lines so indoor players don't shorten the stride.
 */
export function sumLongRunBands(lists: LongRunBand[][]): LongRunBand[] {
  return LONG_RUN_BANDS.map((b, i) => {
    const lines = lists.map((l) => l[i]).filter((x): x is LongRunBand => x != null && x.band === b);
    const bouts = sumOrNull(lines.map((x) => x.bouts));
    const seconds = sumOrNull(lines.map((x) => x.seconds));
    const withDist = lines.filter((x) => x.distanceM != null);
    const distanceM = sumOrNull(withDist.map((x) => x.distanceM));
    const stridesWithDist = sumOrNull(withDist.map((x) => x.strides));
    return {
      band: b, boundsS: lines[0]?.boundsS ?? [DEFAULT_FR_BAND_BOUNDS_S[b - 1], DEFAULT_FR_BAND_BOUNDS_S[b]],
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
export function bandsAreTimeBands(rows: FreeRunningBandRow[], bounds: readonly number[] = DEFAULT_FR_BAND_BOUNDS_S): boolean | null {
  let ok = 0, n = 0;
  for (const row of rows) for (const b of deriveFreeRunningBands(row, bounds)) {
    if (b.boutLengthConsistent == null || (b.bouts ?? 0) < 1) continue;
    n += 1; if (b.boutLengthConsistent) ok += 1;
  }
  return n === 0 ? null : ok / n >= 0.6;
}

export const LONG_RUN_CITATIONS = [
  "Catapult IMA Free Running: bands are bout-duration bands (club's OpenField bounds 0–8–12–15–18–21–24–27 s) — docs/ima-free-running-bands.md",
  "McBurnie et al. 2022 — stride length and high-speed running mechanics",
  "Morin et al. 2011 — stride length as a component of running speed",
];

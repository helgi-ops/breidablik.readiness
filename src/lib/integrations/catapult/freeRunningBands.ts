/**
 * IMA Free Running — what the 8 bands mean, and the per-band numbers derived from
 * what the Catapult sync stores in player_external_load_daily.
 *
 * The bands are BOUT-DURATION bands: each free-running bout (a continuous stretch of
 * running detected by the IMU, V2 algorithm) is put in a band by how many seconds it
 * lasted. They are NOT speed or cadence bands. Confirmed with the fr=1 probe
 * (24 Oct 2026, 15 athletes): duration ÷ event count = 3.8, 10.1, 13.5, 16.6, 19.6,
 * 22.1, 25.9, 30.0 s — each inside Breidablik's OpenField thresholds
 * 0–8–12–15–18–21–24–27–100 — while mean speed (~12–13 km/h) and stride rate
 * (~87–93 strides/min) are flat from band 4 upward.
 *
 * Practical reading: bands 1–3 = short bursts typical of football play; bands 5–8 =
 * long continuous runs (≥18 s) — tempo/conditioning running or long recovery runs,
 * NOT sprints. Sprint exposure belongs to GPS velocity bands (≥25 km/h), see
 * Buchheit & Laursen 2013 and Gabbett 2016 for HSR/sprint load framing.
 *
 * Distance per band is only measurable with GPS (sync stores null indoors); strides,
 * time and bout counts are IMU-only and exist indoors too.
 */

/** Default thresholds in seconds (Breidablik OpenField, Nov 2026). Index i = lower bound of band i+1. */
export const DEFAULT_FR_BAND_BOUNDS_S = [0, 8, 12, 15, 18, 21, 24, 27, 100] as const;

export type FreeRunningBandRow = Record<string, unknown>;

export interface FreeRunningBandDerived {
  band: number;
  /** Bout-length bounds in seconds, e.g. [8, 12]. */
  boundsS: [number, number];
  distanceM: number | null;
  durationS: number | null;
  strides: number | null;
  bouts: number | null;
  strideRatePerMin: number | null;
  playerLoad: number | null;
  /** distance ÷ duration — GPS-dependent. */
  meanSpeedKmh: number | null;
  /** distance ÷ strides — GPS-dependent. */
  metresPerStride: number | null;
  /** duration ÷ bouts — should fall inside boundsS. */
  meanBoutS: number | null;
  /** true when meanBoutS sits inside the band bounds (±1 s tolerance), null when unknown. */
  boutLengthConsistent: boolean | null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function ratio(a: number | null, b: number | null): number | null {
  return a != null && b != null && b > 0 ? a / b : null;
}

/** Derive per-band numbers from a player_external_load_daily row (snake_case columns). */
export function deriveFreeRunningBands(
  row: FreeRunningBandRow,
  bounds: readonly number[] = DEFAULT_FR_BAND_BOUNDS_S,
): FreeRunningBandDerived[] {
  const out: FreeRunningBandDerived[] = [];
  for (let band = 1; band <= 8; band++) {
    const p = `ima_fr_band${band}_`;
    const distanceM = num(row[`${p}total_distance`]);
    const durationS = num(row[`${p}total_duration`]);
    const strides = num(row[`${p}stride_count`]);
    const bouts = num(row[`${p}event_count`]);
    const lo = bounds[band - 1] ?? 0;
    const hi = bounds[band] ?? Number.POSITIVE_INFINITY;
    const speedMs = ratio(distanceM, durationS);
    const meanBoutS = ratio(durationS, bouts);
    out.push({
      band,
      boundsS: [lo, hi],
      distanceM,
      durationS,
      strides,
      bouts,
      strideRatePerMin: num(row[`${p}avg_stride_rate`]),
      playerLoad: num(row[`${p}total_player_load`]),
      meanSpeedKmh: speedMs != null ? speedMs * 3.6 : null,
      metresPerStride: ratio(distanceM, strides),
      meanBoutS,
      boutLengthConsistent: meanBoutS == null ? null : meanBoutS >= lo - 1 && meanBoutS <= hi + 1,
    });
  }
  return out;
}

/** Plain-language band label for coach surfaces (EN default, IS toggle). */
export function freeRunningBandLabel(
  band: number,
  lang: "en" | "is" = "en",
  bounds: readonly number[] = DEFAULT_FR_BAND_BOUNDS_S,
): string {
  const lo = bounds[band - 1] ?? 0;
  const hi = bounds[band];
  const last = band === 8 || hi == null || hi >= 100;
  if (lang === "is") return last ? `Hlaup lengri en ${lo} sek` : `Hlaup ${lo}–${hi} sek`;
  return last ? `Runs longer than ${lo} s` : `Runs of ${lo}–${hi} s`;
}

/**
 * IMA Free Running — what the 8 bands mean, and the per-band numbers derived from
 * what the Catapult sync stores in player_external_load_daily.
 *
 * The bands are BOUT-DURATION bands: each free-running bout (a continuous stretch of
 * running detected by the IMU, V2 algorithm) is put in a band by how many seconds it
 * lasted. They are NOT speed or cadence bands.
 *
 * SOURCE: Catapult support (Nov 2026): "IMA Free Running is a detection algorithm that
 * looks for a consistent time between peaks in player load. Once running we break down
 * into effort length bands in terms of duration (secs)." Catapult's support guide calls
 * the parameter "Cadence" (vertical accelerometer, strides per minute, frequency-peak
 * analysis). Also matched by our fr=1 probe
 * (24 Oct 2026, 15 athletes): duration ÷ event count = 3.8, 10.1, 13.5, 16.6, 19.6,
 * 22.1, 25.9, 30.0 s — each inside Breidablik's OpenField thresholds
 * 0–8–12–15–18–21–24–27–100 — while mean speed (~12–13 km/h) and stride rate
 * (~87–93 strides/min) are flat from band 4 upward.
 *
 * Practical reading (legacy edges): bands 1–3 = short bursts; bands 5–8 = long continuous
 * runs (≥18 s). With the Nov 2026 edges, ≥18 s = bands 6–8 — use the ge18/ge24 tiers. These are
 * tempo/conditioning or long recovery runs,
 * NOT sprints. Sprint exposure belongs to GPS velocity bands (≥25 km/h), see
 * Buchheit & Laursen 2013 and Gabbett 2016 for HSR/sprint load framing.
 *
 * Distance per band is only measurable with GPS (sync stores null indoors); strides,
 * time and bout counts are IMU-only and exist indoors too.
 */

/**
 * LEGACY band edges in seconds (Breiðablik's original OpenField setting, used for every row before
 * 10 Nov 2026 and assumed for teams without a team_fr_band_config row). Index i = lower edge of band i+1.
 *
 * BAND EDGES CHANGE. Catapult applies them at processing time, and Breiðablik moved to
 * 0-2.5-5-8-12-18-24-30-1000 on 9 Nov 2026 (team_fr_band_config). So "band 5" is 18–21 s in old rows and
 * 12–18 s in new rows. Never hard-code a band number as a run length: read the row's own
 * `ima_fr_band_bounds`, or better, the config-independent tiers `ima_fr_ge18_*` / `ima_fr_ge24_*`
 * (efforts ≥18 s / ≥24 s), which the sync computes from the bounds in force.
 */
export const LEGACY_FR_BAND_BOUNDS_S = [0, 8, 12, 15, 18, 21, 24, 27, 100] as const;
/** @deprecated name kept for existing imports — same as LEGACY_FR_BAND_BOUNDS_S. Prefer boundsOfRow(). */
export const DEFAULT_FR_BAND_BOUNDS_S = LEGACY_FR_BAND_BOUNDS_S;

/** Run-length tiers that are band edges in every Breiðablik config, stored as ima_fr_ge{N}_* columns. */
export const FR_TIER_EDGES_S = [18, 24] as const;
export type FrTierEdge = (typeof FR_TIER_EDGES_S)[number];

/** The band edges a stored row was classified with (falls back to legacy). */
export function boundsOfRow(row: FreeRunningBandRow): readonly number[] {
  const b = row["ima_fr_band_bounds"];
  if (Array.isArray(b) && b.length === 9) {
    const n = b.map((x) => num(x));
    if (n.every((x) => x != null)) return n as number[];
  }
  return LEGACY_FR_BAND_BOUNDS_S;
}

/** Band numbers (1–8) whose lower edge is ≥ minS. Null when minS is not an edge of these bounds. */
export function bandsAtOrAbove(bounds: readonly number[], minS: number): number[] | null {
  const idx = bounds.findIndex((e) => Math.abs(e - minS) < 1e-9);
  if (idx < 0 || idx > 7) return null;
  return Array.from({ length: 8 - idx }, (_, i) => idx + 1 + i);
}

/**
 * Band numbers fully inside [loS, hiS) for these bounds (hiS = Infinity for "and above"). Null when loS or a
 * finite hiS is not an edge of these bounds — i.e. that run-length range can't be read from this row.
 * Common edges in every Breiðablik config: 0, 8, 12, 18, 24.
 */
export function bandsBetween(bounds: readonly number[], loS: number, hiS: number = Number.POSITIVE_INFINITY): number[] | null {
  const lo = bounds.findIndex((e) => Math.abs(e - loS) < 1e-9);
  if (lo < 0 || lo > 7) return null;
  const hi = Number.isFinite(hiS) ? bounds.findIndex((e) => Math.abs(e - hiS) < 1e-9) : 8;
  if (hi < 0 || hi <= lo) return null;
  return Array.from({ length: Math.min(hi, 8) - lo }, (_, i) => lo + 1 + i);
}

/** Sum one per-band field over [loS, hiS) for a row, using the row's own bounds. Null = no reading / not readable. */
export function sumBandsBetween(
  row: FreeRunningBandRow,
  field: "stride_count" | "event_count" | "total_duration" | "total_distance" | "total_player_load",
  loS: number,
  hiS: number = Number.POSITIVE_INFINITY,
): number | null {
  const bands = bandsBetween(boundsOfRow(row), loS, hiS);
  if (!bands) return null;
  let any = false;
  let t = 0;
  for (const b of bands) {
    const v = num(row[`ima_fr_band${b}_${field}`]);
    if (v != null) { any = true; t += v; }
  }
  return any ? t : null;
}

export type FrTierTotals = {
  event_count: number | null;
  total_duration: number | null;
  stride_count: number | null;
  total_distance: number | null;
  total_player_load: number | null;
};

/**
 * Sum the band columns of efforts lasting ≥ minS, using the given bounds. A field is null when every
 * contributing band is null (no reading), never 0. Used by the sync to fill ima_fr_ge18_* / ge24_*.
 */
export function tierTotals(
  get: (band: number, field: keyof FrTierTotals) => number | null | undefined,
  bounds: readonly number[],
  minS: number,
): FrTierTotals | null {
  const bands = bandsAtOrAbove(bounds, minS);
  if (!bands) return null;
  const sum = (field: keyof FrTierTotals) => {
    let any = false;
    let t = 0;
    for (const b of bands) {
      const v = get(b, field);
      if (typeof v === "number" && Number.isFinite(v)) { any = true; t += v; }
    }
    return any ? t : null;
  };
  return {
    event_count: sum("event_count"),
    total_duration: sum("total_duration"),
    stride_count: sum("stride_count"),
    total_distance: sum("total_distance"),
    total_player_load: sum("total_player_load"),
  };
}

/** Bounds in force for a date from a team's config list (sorted or not); legacy when none applies. */
export function boundsOnDate(
  configs: Array<{ effective_from: string; bounds_s: Array<number | string> }> | null | undefined,
  dateIso: string,
): readonly number[] {
  const applicable = (configs ?? [])
    .filter((c) => c.effective_from <= dateIso)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
  if (!applicable) return LEGACY_FR_BAND_BOUNDS_S;
  const n = applicable.bounds_s.map((x) => Number(x));
  return n.length === 9 && n.every(Number.isFinite) ? n : LEGACY_FR_BAND_BOUNDS_S;
}

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
  bounds: readonly number[] = boundsOfRow(row),
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
  const f = (x: number) => (Number.isInteger(x) ? String(x) : lang === "is" ? String(x).replace(".", ",") : String(x));
  if (lang === "is") return last ? `Hlaup lengri en ${f(lo)} sek` : `Hlaup ${f(lo)}–${f(hi)} sek`;
  return last ? `Runs longer than ${f(lo)} s` : `Runs of ${f(lo)}–${f(hi)} s`;
}

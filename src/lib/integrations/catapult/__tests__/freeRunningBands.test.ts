import { describe, expect, test } from "vitest";
import {
  CATAPULT_DEFAULT_FR_BAND_BOUNDS_S,
  LEGACY_FR_BAND_BOUNDS_S,
  NEW_FR_BAND_BOUNDS_S,
  bandsAtOrAbove,
  bandsBetween,
  boundsFit,
  fittingBounds,
  frReadingOf,
  hasBoutEvidence,
  sumBandsBetween,
  tierTotals,
  type FreeRunningBandRow,
} from "../freeRunningBands";

/** Build a row from per-band arrays (index 0 = band 1). */
function row(ev: number[], du: number[], extra: FreeRunningBandRow = {}): FreeRunningBandRow {
  const r: FreeRunningBandRow = { ...extra };
  for (let b = 1; b <= 8; b++) {
    r[`ima_fr_band${b}_event_count`] = ev[b - 1] ?? 0;
    r[`ima_fr_band${b}_total_duration`] = du[b - 1] ?? 0;
  }
  return r;
}

// Real Breiðablik rows, 24 Oct 2026 (match). Legacy squad player: means 3.8, 10.1, 13.6, 16.6, 19.6, 22.1, 25.9, 30.0 s.
const LEGACY_ROW = row([206, 37, 17, 17, 9, 4, 5, 5], [780.8, 375.04, 230.4, 281.6, 176.64, 88.32, 129.28, 149.76]);
// Same match, a player on Catapult's 3-band default: means 1.3, 3.2, 10.2 s and bands 4–8 empty.
const DEFAULT3_ROW = row([38, 57, 116, 0, 0, 0, 0, 0], [48.64, 183.04, 1178.88, 0, 0, 0, 0, 0]);
// A session classified with the Nov 2026 edges: means 1.5, 3.5, 6.5, 10, 15, 21, 27, 40 s.
const NEW_ROW = row([10, 8, 6, 5, 4, 3, 2, 1], [15, 28, 39, 50, 60, 63, 54, 40]);

describe("detecting a row's band edges from its own data", () => {
  test("each real config fits exactly one preset", () => {
    expect(fittingBounds(LEGACY_ROW)).toEqual([LEGACY_FR_BAND_BOUNDS_S]);
    expect(fittingBounds(DEFAULT3_ROW)).toEqual([CATAPULT_DEFAULT_FR_BAND_BOUNDS_S]);
    expect(fittingBounds(NEW_ROW)).toEqual([NEW_FR_BAND_BOUNDS_S]);
  });

  test("a row with runs only in band 1 can't tell configs apart", () => {
    const thin = row([12], [20]); // mean 1.7 s: inside 0–8 and 0–2.5
    expect(fittingBounds(thin)).toHaveLength(3);
  });

  test("strides without runs + time is no evidence", () => {
    expect(hasBoutEvidence({ ima_fr_band1_stride_count: 120 })).toBe(false);
    expect(hasBoutEvidence(LEGACY_ROW)).toBe(true);
  });

  test("tolerance is 0.25 s for rounding", () => {
    expect(boundsFit(row([1], [8.2]), NEW_FR_BAND_BOUNDS_S)).toBe(false); // 8.2 s in band 1 (0–2.5)
    expect(boundsFit(row([0, 1], [0, 2.4]), NEW_FR_BAND_BOUNDS_S)).toBe(true); // 2.4 s in band 2 (2.5–5), within 0.25
  });
});

describe("reading long runs", () => {
  test("legacy: ≥18 s = bands 5–8, ≥24 s = 7–8", () => {
    expect(bandsAtOrAbove(LEGACY_FR_BAND_BOUNDS_S, 18)).toEqual([5, 6, 7, 8]);
    expect(bandsAtOrAbove(LEGACY_FR_BAND_BOUNDS_S, 24)).toEqual([7, 8]);
  });

  test("new edges: ≥18 s = bands 6–8, ≥24 s = 7–8", () => {
    expect(bandsAtOrAbove(NEW_FR_BAND_BOUNDS_S, 18)).toEqual([6, 7, 8]);
    expect(bandsAtOrAbove(NEW_FR_BAND_BOUNDS_S, 24)).toEqual([7, 8]);
    const get = (b: number, f: string) => Number(NEW_ROW[`ima_fr_band${b}_${f}`]);
    expect(tierTotals(get, NEW_FR_BAND_BOUNDS_S, 18)?.event_count).toBe(6);
    expect(tierTotals(get, NEW_FR_BAND_BOUNDS_S, 18)?.total_duration).toBe(157);
  });

  test("the 3-band default has no 12/18/24 s edge: no reading, never 0", () => {
    expect(bandsAtOrAbove(CATAPULT_DEFAULT_FR_BAND_BOUNDS_S, 18)).toBeNull();
    expect(bandsBetween(CATAPULT_DEFAULT_FR_BAND_BOUNDS_S, 0, 12)).toBeNull();
    expect(tierTotals(() => 0, CATAPULT_DEFAULT_FR_BAND_BOUNDS_S, 18)).toBeNull();
    const stamped = { ...DEFAULT3_ROW, ima_fr_band_bounds: [...CATAPULT_DEFAULT_FR_BAND_BOUNDS_S] };
    expect(sumBandsBetween(stamped, "event_count", 18)).toBeNull();
  });

  test("12–24 s reads from both real configs", () => {
    expect(bandsBetween(LEGACY_FR_BAND_BOUNDS_S, 12, 24)).toEqual([3, 4, 5, 6]);
    expect(bandsBetween(NEW_FR_BAND_BOUNDS_S, 12, 24)).toEqual([5, 6]);
  });
});

describe("frReadingOf", () => {
  test("ok / catapult_default / unknown_edges / no_fr", () => {
    expect(frReadingOf({ ...LEGACY_ROW, ima_fr_band_bounds: [...LEGACY_FR_BAND_BOUNDS_S], ima_fr_bounds_source: "detected" })).toBe("ok");
    expect(frReadingOf({ ...NEW_ROW, ima_fr_band_bounds: [...NEW_FR_BAND_BOUNDS_S], ima_fr_bounds_source: "detected" })).toBe("ok");
    expect(frReadingOf({ ...DEFAULT3_ROW, ima_fr_band_bounds: [...CATAPULT_DEFAULT_FR_BAND_BOUNDS_S], ima_fr_bounds_source: "detected" })).toBe("catapult_default");
    expect(frReadingOf({ ...LEGACY_ROW, ima_fr_band_bounds: [...LEGACY_FR_BAND_BOUNDS_S], ima_fr_bounds_source: "unknown" })).toBe("unknown_edges");
    expect(frReadingOf({ ima_fr_band_bounds: null })).toBe("no_fr");
  });

  test("numeric strings from PostgREST still read", () => {
    expect(frReadingOf({ ima_fr_band_bounds: ["0", "2.5", "5", "1000", "1000", "1000", "1000", "1000", "1000"] })).toBe("catapult_default");
  });
});

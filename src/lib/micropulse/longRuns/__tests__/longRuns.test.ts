import { test } from "vitest";
import assert from "node:assert/strict";
import { bandsAreTimeBands, longRunBandsOf, longRunBandsTotal, longRunsOf, sumLongRunBands, LONG_RUN_MIN_S } from "../index";

const row = (o: Record<string, unknown>) => o;
const band = (b: number, events: number | null, dur: number | string | null, strides: number | null, dist?: number | null) => ({
  [`ima_fr_band${b}_event_count`]: events, [`ima_fr_band${b}_total_duration`]: dur, [`ima_fr_band${b}_stride_count`]: strides,
  ...(dist === undefined ? {} : { [`ima_fr_band${b}_total_distance`]: dist }),
});
// A Breiðablik-like match row: 5 + 3 + 3 + 3 long runs, 331 s, 491 strides, 1540 m in bands 5–8.
const MATCH = row({ total_distance: 10900, ima_fr_band58_total_distance: 1540,
  ...band(1, 250, "994.5", 1404), ...band(5, 5, 108, 160), ...band(6, 3, 63, 94), ...band(7, 3, 67, 99), ...band(8, 3, 93, 138) });

test("longRunsOf: sums bands 5–8 for bouts, time and strides; the longest band present; stride rate from time", () => {
  const r = longRunsOf(MATCH);
  assert.equal(LONG_RUN_MIN_S, 18);
  assert.equal(r.bouts, 14);
  assert.equal(r.seconds, 331);
  assert.equal(Math.round(r.meanBoutS! * 10) / 10, 23.6);
  assert.equal(r.longestBand, 8);
  assert.equal(r.strides, 491);
  assert.equal(r.distanceM, 1540);
  assert.equal(Math.round(r.metresPerStride! * 100) / 100, 3.14);
  assert.equal(Math.round(r.strideRatePerMin!), 89);
});

test("longRunsOf: indoors the bouts and time stay, distance and stride length are missing, not 0", () => {
  const indoor = longRunsOf(row({ ...MATCH, total_distance: 0, ima_fr_band58_total_distance: 0 }));
  assert.equal(indoor.bouts, 14);
  assert.equal(indoor.seconds, 331);
  assert.equal(indoor.distanceM, null);
  assert.equal(indoor.metresPerStride, null);
  assert.equal(Math.round(indoor.strideRatePerMin!), 89);
});

test("longRunsOf: a row without bout counts reads as missing, and the longest band skips empty bands", () => {
  const old = longRunsOf(row({ total_distance: 9000, ima_fr_band58_total_distance: 900, ima_fr_band6_stride_count: 80 }));
  assert.equal(old.bouts, null); assert.equal(old.seconds, null); assert.equal(old.longestBand, null);
  assert.equal(old.strides, 80); assert.equal(old.distanceM, 900); assert.equal(old.strideRatePerMin, null);
  const r = longRunsOf(row({ ...band(5, 4, 80, 100), ...band(6, 0, 0, 0), ...band(7, 1, 25, 40), ...band(8, 0, 0, 0) }));
  assert.equal(r.longestBand, 7); assert.equal(r.bouts, 5);
});

test("bandsAreTimeBands: Breiðablik-like rows pass, bands set up as something else fail, no bouts → null", () => {
  assert.equal(bandsAreTimeBands([MATCH]), true);
  // Mean bout of 60 s in band 5 (bounds 18–21 s): these aren't the bands the labels describe.
  const odd = row({ ...band(5, 2, 120, 160), ...band(6, 2, 150, 94), ...band(7, 1, 90, 99) });
  assert.equal(bandsAreTimeBands([odd]), false);
  assert.equal(bandsAreTimeBands([row({ ima_fr_band6_stride_count: 80 })]), null);
});

const WITH_DIST = row({ total_distance: 10900, ima_fr_band58_total_distance: 1540,
  ...band(5, 5, 108, 160, 423), ...band(6, 3, 63, 94, 260), ...band(7, 3, 67, 99, 330), ...band(8, 3, 93, 138, 527) });

test("longRunBandsOf: four lines with the four OpenField variables; the lines add up to longRunsOf", () => {
  const lines = longRunBandsOf(WITH_DIST);
  assert.deepEqual(lines.map((l) => l.band), [5, 6, 7, 8]);
  assert.deepEqual(lines[0].boundsS, [18, 21]);
  assert.equal(lines[0].bouts, 5); assert.equal(lines[0].seconds, 108); assert.equal(lines[0].distanceM, 423); assert.equal(lines[0].strides, 160);
  assert.equal(Math.round(lines[0].meanBoutS! * 10) / 10, 21.6);
  assert.equal(Math.round(lines[0].metresPerStride! * 100) / 100, 2.64);
  const all = longRunsOf(WITH_DIST);
  const sum = (k: "bouts" | "seconds" | "strides" | "distanceM") => lines.reduce((s, l) => s + (l[k] ?? 0), 0);
  assert.equal(sum("bouts"), all.bouts); assert.equal(sum("seconds"), all.seconds); assert.equal(sum("strides"), all.strides);
  assert.equal(sum("distanceM"), all.distanceM);
});

test("longRunBandsOf: indoors every line keeps runs, time and strides, with distance missing", () => {
  const lines = longRunBandsOf(row({ ...WITH_DIST, total_distance: 0 }));
  assert.ok(lines.every((l) => l.distanceM === null && l.metresPerStride === null));
  assert.equal(lines[3].bouts, 3); assert.equal(lines[3].seconds, 93); assert.equal(lines[3].strides, 138);
});

test("sumLongRunBands: adds players; stride length only over players with GPS", () => {
  const outdoor = longRunBandsOf(WITH_DIST);
  const indoor = longRunBandsOf(row({ ...WITH_DIST, total_distance: 0 }));
  const team = sumLongRunBands([outdoor, indoor]);
  assert.equal(team[0].bouts, 10); assert.equal(team[0].seconds, 216); assert.equal(team[0].strides, 320);
  assert.equal(team[0].distanceM, 423);
  assert.equal(Math.round(team[0].metresPerStride! * 100) / 100, 2.64);
  assert.equal(sumLongRunBands([indoor])[0].distanceM, null);
  // Lines are keyed by run-length bounds taken from the inputs, so no input → no lines.
  assert.deepEqual(sumLongRunBands([]), []);
});

test("longRunBandsTotal: the total line equals longRunsOf for one row", () => {
  const tot = longRunBandsTotal(longRunBandsOf(WITH_DIST));
  const all = longRunsOf(WITH_DIST);
  assert.equal(tot.bouts, all.bouts); assert.equal(tot.seconds, all.seconds); assert.equal(tot.strides, all.strides);
  assert.equal(tot.distanceM, all.distanceM); assert.equal(tot.metresPerStride, all.metresPerStride);
  assert.equal(longRunBandsTotal(longRunBandsOf(row({ ...WITH_DIST, total_distance: 0 }))).distanceM, null);
});

// ── Nov-2026 band edges (Breiðablik from 10 Nov 2026): 0-2.5-5-8-12-18-24-30-1000 → long runs (≥18 s) = bands 6–8.
const NEW_BOUNDS = [0, 2.5, 5, 8, 12, 18, 24, 30, 1000];
// Band 5 here is 12–18 s (NOT a long run); bands 6/7/8 = 18–24 / 24–30 / 30+ s.
const NEW_ROW = row({ total_distance: 10500, ima_fr_band_bounds: NEW_BOUNDS,
  ...band(1, 200, 300, 900, 1200), ...band(5, 9, 130, 190, 450),
  ...band(6, 6, 120, 180, 470), ...band(7, 3, 80, 120, 330), ...band(8, 2, 70, 100, 290) });

test("new edges: long runs = bands 6–8 (band 5 = 12–18 s is not counted)", () => {
  const r = longRunsOf(NEW_ROW);
  assert.equal(r.bouts, 11); // 6 + 3 + 2
  assert.equal(r.seconds, 270);
  assert.equal(r.strides, 400);
  assert.equal(r.distanceM, 1090);
  assert.equal(r.longestBand, 8);
});

test("new edges: longRunBandsOf returns 3 lines with the row's own bounds", () => {
  const lines = longRunBandsOf(NEW_ROW);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((l) => l.band), [6, 7, 8]);
  assert.deepEqual(lines.map((l) => l.boundsS), [[18, 24], [24, 30], [30, 1000]]);
  assert.equal(lines[0].bouts, 6); assert.equal(lines[0].strides, 180); assert.equal(lines[0].distanceM, 470);
  const tot = longRunBandsTotal(lines);
  assert.equal(tot.bouts, longRunsOf(NEW_ROW).bouts); assert.equal(tot.strides, longRunsOf(NEW_ROW).strides);
});

test("new edges: bounds given as strings (numeric[] from PostgREST) are read the same", () => {
  const lines = longRunBandsOf(row({ ...NEW_ROW, ima_fr_band_bounds: NEW_BOUNDS.map(String) }));
  assert.deepEqual(lines.map((l) => l.band), [6, 7, 8]);
});

test("sumLongRunBands: legacy and new rows stay in separate lines, matched by bounds not band number", () => {
  const legacy = longRunBandsOf(WITH_DIST); // 18–21, 21–24, 24–27, 27–100
  const fresh = longRunBandsOf(NEW_ROW);   // 18–24, 24–30, 30–1000
  const team = sumLongRunBands([legacy, fresh, fresh]);
  assert.deepEqual(team.map((l) => l.boundsS), [[18, 21], [18, 24], [21, 24], [24, 27], [24, 30], [27, 100], [30, 1000]]);
  const line = (lo: number, hi: number) => team.find((l) => l.boundsS[0] === lo && l.boundsS[1] === hi)!;
  // Legacy band 6 (21–24 s) and new band 6 (18–24 s) are NOT added together.
  assert.equal(line(21, 24).bouts, 3);
  assert.equal(line(18, 24).bouts, 12); // new band 6 × 2 rows
  assert.equal(line(18, 21).bouts, 5);
  assert.equal(line(30, 1000).strides, 200);
  // Every run is counted exactly once.
  const allBouts = team.reduce((s, l) => s + (l.bouts ?? 0), 0);
  assert.equal(allBouts, longRunsOf(WITH_DIST).bouts! + 2 * longRunsOf(NEW_ROW).bouts!);
});

test("longRunsOf: the stored ima_fr_ge18_* tier columns are preferred over summing bands", () => {
  const withTier = row({ ...NEW_ROW, ima_fr_ge18_event_count: 99, ima_fr_ge18_total_duration: 999,
    ima_fr_ge18_stride_count: 4321, ima_fr_ge18_total_distance: 2222 });
  const r = longRunsOf(withTier);
  assert.equal(r.bouts, 99); assert.equal(r.seconds, 999); assert.equal(r.strides, 4321); assert.equal(r.distanceM, 2222);
  // Indoors the tier distance is still withheld (no GPS reading).
  assert.equal(longRunsOf(row({ ...withTier, total_distance: 0 })).distanceM, null);
  // The ge18 distance also beats the legacy band58 rollup.
  assert.equal(longRunsOf(row({ ...withTier, ima_fr_band58_total_distance: 5 })).distanceM, 2222);
});

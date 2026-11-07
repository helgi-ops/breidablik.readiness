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
  assert.equal(sumLongRunBands([])[0].bouts, null);
});

test("longRunBandsTotal: the total line equals longRunsOf for one row", () => {
  const tot = longRunBandsTotal(longRunBandsOf(WITH_DIST));
  const all = longRunsOf(WITH_DIST);
  assert.equal(tot.bouts, all.bouts); assert.equal(tot.seconds, all.seconds); assert.equal(tot.strides, all.strides);
  assert.equal(tot.distanceM, all.distanceM); assert.equal(tot.metresPerStride, all.metresPerStride);
  assert.equal(longRunBandsTotal(longRunBandsOf(row({ ...WITH_DIST, total_distance: 0 }))).distanceM, null);
});

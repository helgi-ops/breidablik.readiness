import { test } from "vitest";
import assert from "node:assert/strict";
import {
  buildRawFeatures, buildTrainingSamples, fitNorm, applyNorm,
  FEATURE_KEYS, FEATURE_LABELS, type PlayerHistory,
} from "../features";

function isoAdd(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A player with 8 weeks of daily load + weekly-ish check-ins, anchored at an end date.
function makeHistory(end: string, weeks: number): PlayerHistory {
  const loadByDate = new Map<string, number>();
  const wellnessByDate = new Map<string, number>();
  const mdOffsetByDate = new Map<string, number>();
  const days = weeks * 7;
  for (let i = days; i >= 0; i--) {
    const d = isoAdd(end, -i);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 Sun..6 Sat
    // Sat = match (0 load logged as match), heavy midweek, rest Sun/Mon.
    const load = dow === 0 || dow === 1 ? 0 : dow === 6 ? 600 : 350;
    loadByDate.set(d, load);
    mdOffsetByDate.set(d, dow === 6 ? 0 : dow === 5 ? -1 : dow === 4 ? -2 : dow === 3 ? -3 : -4);
    // Check-in every day; wellness ~ inverse of recent load (heavier week → lower total).
    const total = dow === 0 ? 20 : dow === 1 ? 19 : dow >= 4 ? 13 : 16;
    wellnessByDate.set(d, total);
  }
  return { loadByDate, wellnessByDate, mdOffsetByDate };
}

test("buildRawFeatures returns null with no prior wellness (lag-1 gate)", () => {
  const h: PlayerHistory = { loadByDate: new Map([["2026-06-01", 400]]), wellnessByDate: new Map(), mdOffsetByDate: new Map() };
  assert.equal(buildRawFeatures(h, "2026-06-02", 400, -2), null);
});

test("buildRawFeatures: acute reacts faster than chronic on a recent ramp", () => {
  const loadByDate = new Map<string, number>();
  const wellnessByDate = new Map<string, number>();
  const end = "2026-06-30";
  // Flat low load for a month, then a heavy last week.
  for (let i = 35; i >= 1; i--) {
    const d = isoAdd(end, -i);
    loadByDate.set(d, i <= 7 ? 700 : 150);
  }
  wellnessByDate.set(isoAdd(end, -1), 15); // a lag-1 check-in exists
  const h: PlayerHistory = { loadByDate, wellnessByDate, mdOffsetByDate: new Map() };
  const raw = buildRawFeatures(h, end, 700, 0)!;
  assert.ok(raw != null);
  assert.ok(raw.acute7 > raw.chronic28, `acute ${raw.acute7.toFixed(0)} should exceed chronic ${raw.chronic28.toFixed(0)} after a ramp`);
  assert.equal(raw.plannedLoad, 700);
  assert.equal(raw.wellnessLag1, 15);
});

test("buildTrainingSamples: one sample per usable check-in day, chronologically sorted", () => {
  const h = makeHistory("2026-06-30", 6);
  const samples = buildTrainingSamples(h);
  assert.ok(samples.length > 20, `expected many samples, got ${samples.length}`);
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i].date >= samples[i - 1].date, "samples must be date-sorted");
  }
  // Every sample carries a valid 1..4 class and a 6-feature raw vector.
  for (const s of samples) {
    assert.ok(s.y >= 1 && s.y <= 4);
    assert.equal(Object.keys(s.raw).length, FEATURE_KEYS.length);
  }
});

test("fitNorm + applyNorm: z-scored vector has the right length and ~0 mean over the set", () => {
  const h = makeHistory("2026-06-30", 8);
  const samples = buildTrainingSamples(h);
  const norm = fitNorm(samples.map((s) => s.raw));
  const xs = samples.map((s) => applyNorm(s.raw, norm));
  assert.equal(xs[0].length, FEATURE_KEYS.length);
  // Mean of each z-scored feature across the set should be ~0.
  for (let j = 0; j < FEATURE_KEYS.length; j++) {
    const col = xs.map((x) => x[j]);
    const m = col.reduce((s, v) => s + v, 0) / col.length;
    assert.ok(Math.abs(m) < 1e-6, `feature ${FEATURE_KEYS[j]} z-mean should be ~0, got ${m}`);
  }
});

test("FEATURE_LABELS is complete and bilingual for every key", () => {
  for (const key of FEATURE_KEYS) {
    const l = FEATURE_LABELS[key];
    assert.ok(l && l.en && l.is && l.en !== l.is, `label for ${key} must be bilingual`);
  }
});

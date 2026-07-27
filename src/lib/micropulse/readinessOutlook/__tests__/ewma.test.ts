import { test } from "vitest";
import assert from "node:assert/strict";
import { ewma, mean, stdev, zscore } from "../ewma";
import { classFromTotalScore, classLabel, classTone } from "../target";

test("ewma: constant series returns the constant; empty → null", () => {
  assert.equal(ewma([5, 5, 5, 5], 7), 5);
  assert.equal(ewma([], 7), null);
  assert.equal(ewma([9], 28), 9); // single point = itself
});

test("ewma: weights recent points more; a shorter span reacts faster", () => {
  const series = [0, 0, 0, 0, 0, 0, 100]; // spike on the last day after rest days
  const fast = ewma(series, 7)!;
  const slow = ewma(series, 28)!;
  assert.ok(fast > slow, `7-day span should react faster than 28-day (${fast} vs ${slow})`);
  assert.ok(fast > 0 && fast < 100, "recent spike lifts but doesn't equal the raw value");
});

test("mean / stdev: basic + null guards", () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(mean([]), null);
  assert.equal(stdev([5]), null); // needs ≥2
  assert.ok(Math.abs(stdev([2, 4, 6])! - Math.sqrt(8 / 3)) < 1e-9);
});

test("zscore: standard case + safe on flat/thin baseline", () => {
  assert.equal(zscore(12, 10, 2), 1);
  assert.equal(zscore(8, 10, 2), -1);
  assert.equal(zscore(12, 10, 0), 0);   // flat baseline → 0, never Infinity
  assert.equal(zscore(12, null, null), 0); // no baseline → 0
});

test("classFromTotalScore mirrors the app's total_score bands; null-safe", () => {
  assert.equal(classFromTotalScore(25), 4); // GREEN_PLUS
  assert.equal(classFromTotalScore(17), 4);
  assert.equal(classFromTotalScore(16), 3); // GREEN
  assert.equal(classFromTotalScore(14), 3);
  assert.equal(classFromTotalScore(13), 2); // YELLOW
  assert.equal(classFromTotalScore(11), 2);
  assert.equal(classFromTotalScore(10), 1); // RED
  assert.equal(classFromTotalScore(5), 1);
  assert.equal(classFromTotalScore(null), null);
  assert.equal(classFromTotalScore(undefined), null);
});

test("classLabel / classTone are complete and bilingual", () => {
  for (const c of [1, 2, 3, 4] as const) {
    const l = classLabel(c);
    assert.ok(l.en && l.is && l.en !== l.is, `class ${c} must be bilingual`);
  }
  assert.equal(classTone(4), "good");
  assert.equal(classTone(3), "good");
  assert.equal(classTone(2), "watch");
  assert.equal(classTone(1), "concern");
});

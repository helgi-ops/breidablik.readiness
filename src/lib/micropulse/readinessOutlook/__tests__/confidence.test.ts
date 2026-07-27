import { test } from "vitest";
import assert from "node:assert/strict";
import { computeOutlookConfidence, OUTLOOK_MIN_WEEKS } from "../confidence";

const stableWeeks = (n: number, load = 2000) => Array.from({ length: n }, () => load);

test("withholds below the minimum weeks or samples — no forecast on thin data", () => {
  const thin = computeOutlookConfidence({ weeksOfData: OUTLOOK_MIN_WEEKS - 1, sampleCount: 40, weeklyLoads: stableWeeks(5), holdoutWithin1: 0.9 });
  assert.equal(thin.level, "withheld");
  assert.equal(thin.score, 0);
  const fewSamples = computeOutlookConfidence({ weeksOfData: 30, sampleCount: 5, weeklyLoads: stableWeeks(20), holdoutWithin1: 0.9 });
  assert.equal(fewSamples.level, "withheld");
});

test("mature + stable + accurate → high confidence", () => {
  const c = computeOutlookConfidence({ weeksOfData: 30, sampleCount: 120, weeklyLoads: stableWeeks(20), holdoutWithin1: 0.9 });
  assert.equal(c.level, "high");
  assert.ok(c.score >= 0.75);
  assert.ok(c.note.en.length > 0 && c.note.is.length > 0 && c.note.en !== c.note.is);
});

test("immature baseline is capped at moderate even when otherwise strong", () => {
  const c = computeOutlookConfidence({ weeksOfData: 10, sampleCount: 60, weeklyLoads: stableWeeks(20), holdoutWithin1: 0.95 });
  assert.notEqual(c.level, "high");
  assert.ok(c.maturity < 1);
});

test("no holdout yet caps at moderate and marks predictability null", () => {
  const c = computeOutlookConfidence({ weeksOfData: 30, sampleCount: 120, weeklyLoads: stableWeeks(20), holdoutWithin1: null });
  assert.equal(c.predictability, null);
  assert.notEqual(c.level, "high");
});

test("erratic schedule lowers stability and surfaces it as the limiter", () => {
  const erratic = [500, 3200, 300, 2800, 100, 3000]; // wildly varying weekly load
  const c = computeOutlookConfidence({ weeksOfData: 30, sampleCount: 120, weeklyLoads: erratic, holdoutWithin1: 0.9 });
  assert.ok(c.stability < 0.6, `erratic weeks should drop stability, got ${c.stability.toFixed(2)}`);
  // The note should mention the schedule when it's the weakest link.
  assert.ok(/schedule|skipulag/i.test(c.note.en + c.note.is));
});

test("noisy player (low holdout) downgrades and names predictability", () => {
  const c = computeOutlookConfidence({ weeksOfData: 30, sampleCount: 120, weeklyLoads: stableWeeks(20), holdoutWithin1: 0.35 });
  assert.ok(c.predictability != null && c.predictability < 0.5);
  assert.ok(c.level === "low" || c.level === "moderate");
});

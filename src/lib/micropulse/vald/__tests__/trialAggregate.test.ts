import { test } from "vitest";
import assert from "node:assert/strict";
import { aggregateTrialsByTest, metricSeries, type TrialMetricRow } from "../trialAggregate";

const METRICS = ["jumpHeight", "timeToTakeoff", "peakForce"];

function trial(rawTestId: string | null, ts: string, m: Record<string, number | null>): TrialMetricRow {
  return { rawTestId, testTimestamp: ts, metrics: m };
}

test("three trials of one test collapse to a single mean-per-metric aggregate", () => {
  const rows = [
    trial("t1", "2026-07-20T10:00:00Z", { jumpHeight: 30, timeToTakeoff: 600, peakForce: 2000 }),
    trial("t1", "2026-07-20T10:01:00Z", { jumpHeight: 32, timeToTakeoff: 620, peakForce: 2100 }),
    trial("t1", "2026-07-20T10:02:00Z", { jumpHeight: 34, timeToTakeoff: 640, peakForce: 2200 }),
  ];
  const [agg] = aggregateTrialsByTest(rows, METRICS);
  assert.equal(agg.trialCount, 3);
  assert.equal(agg.metrics.jumpHeight, 32); // mean, not best (34)
  assert.equal(agg.metrics.timeToTakeoff, 620);
  assert.equal(agg.metrics.peakForce, 2100);
  assert.equal(agg.testTimestamp, "2026-07-20T10:02:00Z"); // newest trial in group
});

test("a trial missing a metric still contributes to the metrics it has (null-safe mean)", () => {
  const rows = [
    trial("t1", "2026-07-20T10:00:00Z", { jumpHeight: 30, timeToTakeoff: null, peakForce: 2000 }),
    trial("t1", "2026-07-20T10:01:00Z", { jumpHeight: 40, timeToTakeoff: 600, peakForce: null }),
  ];
  const [agg] = aggregateTrialsByTest(rows, METRICS);
  assert.equal(agg.metrics.jumpHeight, 35); // (30+40)/2
  assert.equal(agg.metrics.timeToTakeoff, 600); // only the one present value
  assert.equal(agg.metrics.peakForce, 2000);
  assert.equal(agg.trialCount, 2);
});

test("a metric absent from every trial aggregates to null, never zero", () => {
  const rows = [
    trial("t1", "2026-07-20T10:00:00Z", { jumpHeight: 30, timeToTakeoff: null, peakForce: null }),
    trial("t1", "2026-07-20T10:01:00Z", { jumpHeight: 32, timeToTakeoff: null, peakForce: null }),
  ];
  const [agg] = aggregateTrialsByTest(rows, METRICS);
  assert.equal(agg.metrics.peakForce, null);
  assert.equal(agg.metrics.timeToTakeoff, null);
});

test("two tests produce two aggregates, newest first", () => {
  const rows = [
    trial("older", "2026-07-10T10:00:00Z", { jumpHeight: 30 }),
    trial("older", "2026-07-10T10:01:00Z", { jumpHeight: 30 }),
    trial("newer", "2026-07-20T10:00:00Z", { jumpHeight: 40 }),
  ];
  const aggs = aggregateTrialsByTest(rows, ["jumpHeight"]);
  assert.equal(aggs.length, 2);
  assert.equal(aggs[0].rawTestId, "newer");
  assert.equal(aggs[1].rawTestId, "older");
  assert.deepEqual(metricSeries(aggs, "jumpHeight"), [40, 30]);
});

test("legacy rows without raw_test_id group by calendar day", () => {
  const rows = [
    trial(null, "2026-07-20T10:00:00Z", { jumpHeight: 30 }),
    trial(null, "2026-07-20T10:05:00Z", { jumpHeight: 34 }),
    trial(null, "2026-07-21T10:00:00Z", { jumpHeight: 50 }),
  ];
  const aggs = aggregateTrialsByTest(rows, ["jumpHeight"]);
  assert.equal(aggs.length, 2);
  assert.equal(aggs[0].metrics.jumpHeight, 50); // 21st
  assert.equal(aggs[1].metrics.jumpHeight, 32); // mean of the two 20th trials
});

test("empty input returns no aggregates", () => {
  assert.deepEqual(aggregateTrialsByTest([], METRICS), []);
});

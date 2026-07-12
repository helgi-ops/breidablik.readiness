import { test } from "vitest";
import assert from "node:assert/strict";
import { classifyMatchLoad, IMPLAUSIBLE_M_PER_MIN } from "../matchMinutes";

// Ground truth: HK vs Ægir, 2026-07-10. Numbers taken from the bug report.

test("substitute who came ON is contaminated and refused as a match benchmark", () => {
  // Atli Þór Gunnarsson: pod 51.5 min (full 2nd half), played ~20.
  const v = classifyMatchLoad({
    podMinutes: 51.5,
    minutesPlayed: 20,
    distanceM: 3983,
    highSpeedM: 3983 * 0.037,
    startedMatch: false,
  });
  assert.equal(v.context, "bench_contaminated");
  assert.equal(v.usableAsMatchBenchmark, false);
  assert.equal(v.mPerMin, null, "must refuse to publish a polluted match rate");
  assert.equal(v.benchMinutes, 31.5);
  assert.ok(/touchline warm-up/i.test(v.reason));
  assert.ok(v.reasonIs.includes("upphitun"));
});

test("full-match starter entered as nominal 90 is rated over the pod window, not false-flagged", () => {
  // Dominik/Arnþór/Svavar: entered 90, pod 101.3 (stoppage). Over 90 → 130.8 m/min
  // (over the 130 ceiling → would false-flag). Over the true 101.3 → 116, textbook.
  const v = classifyMatchLoad({
    podMinutes: 101.3,
    minutesPlayed: 90,
    distanceM: 11774,
    highSpeedM: 11774 * 0.054,
    startedMatch: true,
  });
  assert.equal(v.context, "match_full");
  assert.equal(v.implausible, false, "must not flag a full-match starter as impossible");
  assert.equal(v.usableAsMatchBenchmark, true);
  assert.equal(v.benchMinutes, 0, "the 11-min gap is stoppage, not bench-sitting");
  assert.ok(v.mPerMin != null && v.mPerMin > 110 && v.mPerMin < 120, `rate ${v.mPerMin}`);
});

test("starter subbed OFF keeps his numbers — the pod overhang is bench sitting, not running", () => {
  // Karl Ágúst: 7,372 m / 65 min = 113 m/min; pod ran the full match while he sat.
  const v = classifyMatchLoad({
    podMinutes: 101.3,
    minutesPlayed: 65,
    distanceM: 7372,
    highSpeedM: 7372 * 0.1,
    startedMatch: true,
  });
  assert.equal(v.context, "match_partial");
  assert.equal(v.usableAsMatchBenchmark, true, "a subbed-off starter is good data");
  assert.equal(v.mPerMin, 113.4);
  assert.ok(/on the bench/i.test(v.reason));
});

test("named but never came on (0 min) is load, not a match", () => {
  const v = classifyMatchLoad({
    podMinutes: 51.5,
    minutesPlayed: 0,
    distanceM: 2000,
    highSpeedM: 100,
    startedMatch: false,
  });
  assert.equal(v.context, "unused");
  assert.equal(v.usableAsMatchBenchmark, false);
  assert.equal(v.benchMinutes, 51.5);
});

test("no minutes entered → unknown, and it refuses to assert a benchmark", () => {
  const v = classifyMatchLoad({
    podMinutes: 51.5,
    minutesPlayed: null,
    distanceM: 3983,
    highSpeedM: 147,
    startedMatch: false,
  });
  assert.equal(v.context, "unknown");
  assert.equal(v.usableAsMatchBenchmark, false);
  assert.equal(v.mPerMin, null);
  // pod rate is still computable (often misleading, but available)
  assert.ok(v.podMPerMin != null && v.podMPerMin > 0);
});

test("a clean full match is usable and reports a match rate", () => {
  const v = classifyMatchLoad({
    podMinutes: 96,
    minutesPlayed: 95,
    distanceM: 10500,
    highSpeedM: 1100,
    startedMatch: true,
  });
  assert.equal(v.context, "match_full");
  assert.equal(v.usableAsMatchBenchmark, true);
  assert.ok(v.mPerMin != null && v.mPerMin > 100 && v.mPerMin < 120);
});

test("impossible m/min is flagged implausible and refused (the manual-entry bug)", () => {
  // Atli Hrafn: manual 10,902 m credited as if a full match over ~50 real min.
  const v = classifyMatchLoad({
    podMinutes: 50,
    minutesPlayed: 50,
    distanceM: 10902,
    highSpeedM: 1200,
    startedMatch: true,
  });
  assert.equal(v.implausible, true);
  assert.equal(v.usableAsMatchBenchmark, false);
  assert.ok(v.mPerMin != null && v.mPerMin > IMPLAUSIBLE_M_PER_MIN);
});

test("high-speed share is computed from distance regardless of verdict", () => {
  const v = classifyMatchLoad({
    podMinutes: 51.5,
    minutesPlayed: 20,
    distanceM: 2848,
    highSpeedM: 2848 * 0.121,
    startedMatch: false,
  });
  assert.equal(v.highSpeedPct, 12.1);
});

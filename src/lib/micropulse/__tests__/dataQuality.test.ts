import { test } from "vitest";
import assert from "node:assert/strict";
import { checkRow } from "../dataQuality";
import { PLAUSIBLE_STRIDE_MIN, PLAUSIBLE_STRIDE_MAX } from "../strideLength";

/** Only the stride-length fields matter here; the rest are "nothing to check". */
const row = (strideLengthM: number | null) =>
  checkRow({ maxVelocityKmh: null, totalDistanceM: null, podMinutes: null, strideLengthM });

const strideIssues = (strideLengthM: number | null) =>
  row(strideLengthM).filter((i) => i.kind === "impossible_stride_length");

test("an impossible stride length is BLOCKED as a data problem, not an athlete problem", () => {
  for (const bad of [0.79, 4.2]) {
    const issues = strideIssues(bad);
    assert.equal(issues.length, 1, `expected ${bad} m to be flagged`);
    assert.equal(issues[0].severity, "block"); // must never reach a baseline
    assert.equal(issues[0].field, "stride_length");
    assert.equal(issues[0].value, bad);
    assert.ok(/data problem/i.test(issues[0].reason), issues[0].reason);
    assert.ok(/mis-configuration|band or unit/i.test(issues[0].reason), issues[0].reason);
    assert.ok(/gagnavilla/i.test(issues[0].reasonIs), issues[0].reasonIs);
  }
});

test("real stride lengths — including the Ágúst Orri fatigue case — are not flagged", () => {
  for (const ok of [1.90, 2.3, 2.7, PLAUSIBLE_STRIDE_MIN, PLAUSIBLE_STRIDE_MAX]) {
    assert.equal(strideIssues(ok).length, 0, `${ok} m should be accepted`);
  }
});

test("no stride length to judge → no stride issue (silence, not a false flag)", () => {
  assert.equal(strideIssues(null).length, 0);
});

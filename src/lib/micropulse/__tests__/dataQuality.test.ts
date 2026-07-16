import { test } from "vitest";
import assert from "node:assert/strict";
import { checkRow, checkConsent } from "../dataQuality";
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

// ── Consent gaps ─────────────────────────────────────────────────────────────

test("an under-18 with only a self-consent is REPORTED, never treated as covered", () => {
  const gap = checkConsent({ isMinor: true, hasActiveConsent: true, grantedByRelationship: "self" });
  assert.equal(gap?.kind, "minor_self_consent");
  assert.equal(gap?.actionable, true);
  assert.ok(/cannot validly consent/i.test(gap!.reason));
});

test("an under-18 with a guardian consent is covered", () => {
  for (const rel of ["parent", "guardian"]) {
    assert.equal(checkConsent({ isMinor: true, hasActiveConsent: true, grantedByRelationship: rel }), null);
  }
});

test("unknown DOB is a gap — unknown age is not an adult", () => {
  const gap = checkConsent({ isMinor: null, hasActiveConsent: true, grantedByRelationship: "self" });
  assert.equal(gap?.kind, "dob_unknown");
  assert.ok(/not an adult/i.test(gap!.reason));
});

test("no consent at all is a gap, whatever the age", () => {
  for (const m of [true, false, null]) {
    assert.equal(checkConsent({ isMinor: m, hasActiveConsent: false, grantedByRelationship: null })?.kind, "no_consent");
  }
});

test("an adult with their own consent is covered — no noise", () => {
  assert.equal(checkConsent({ isMinor: false, hasActiveConsent: true, grantedByRelationship: "self" }), null);
});

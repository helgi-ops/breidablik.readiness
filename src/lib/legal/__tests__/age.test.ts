import { test } from "vitest";
import assert from "node:assert/strict";
import { ageYears, isMinor, isPlausibleDob, CONSENT_MAJORITY_AGE } from "../age";

const asOf = new Date("2026-07-16T00:00:00Z");

test("age is calendar-correct, including the day before/on a birthday", () => {
  assert.equal(ageYears("2008-07-17", asOf), 17); // birthday tomorrow → still 17
  assert.equal(ageYears("2008-07-16", asOf), 18); // birthday today → 18
  assert.equal(ageYears("2008-07-15", asOf), 18);
  assert.equal(ageYears("2000-01-01", asOf), 26);
});

test("unknown DOB is UNKNOWN — never silently an adult", () => {
  for (const bad of [null, undefined, "", "not-a-date"]) {
    assert.equal(ageYears(bad, asOf), null);
    assert.equal(isMinor(bad, asOf), null); // null, NOT false
  }
});

test("isMinor gates exactly on the majority age", () => {
  assert.equal(isMinor("2008-07-17", asOf), true); // 17
  assert.equal(isMinor("2008-07-16", asOf), false); // 18 today
  assert.equal(isMinor("2010-01-01", asOf), true);
  assert.equal(isMinor("1990-01-01", asOf), false);
  assert.equal(CONSENT_MAJORITY_AGE, 18);
});

test("a future DOB yields nothing, not a negative age", () => {
  assert.equal(ageYears("2030-01-01", asOf), null);
  assert.equal(isMinor("2030-01-01", asOf), null);
});

test("implausible DOBs are rejected before they can be stored", () => {
  assert.equal(isPlausibleDob("2008-01-01", asOf), true);
  assert.equal(isPlausibleDob("2024-01-01", asOf), false); // age 2 — a typo
  assert.equal(isPlausibleDob("1850-01-01", asOf), false); // age 176
  assert.equal(isPlausibleDob("2030-01-01", asOf), false); // future
  assert.equal(isPlausibleDob(null, asOf), false);
});

import { test } from "vitest";
import assert from "node:assert/strict";
import { buildCmjReturnRead, currentValdFlag, selectCmjBaseline, strengthRetestList, worstValdFlag } from "../flagFreshness";

const t = (testTimestamp: string) => ({ testTimestamp });

test("selectCmjBaseline: 3 recent tests are enough, and only the last 5 are used", () => {
  const three = selectCmjBaseline("2026-07-22T10:00:00Z", [t("2026-07-15T10:00:00Z"), t("2026-07-10T10:00:00Z"), t("2026-07-05T10:00:00Z")]);
  assert.equal(three.status, "ready");
  assert.equal(three.daysSincePrevious, 7);
  const seven = selectCmjBaseline("2026-07-22T10:00:00Z", ["07-20", "07-18", "07-16", "07-14", "07-12", "07-10", "07-08"].map((d) => t(`2026-${d}T10:00:00Z`)));
  assert.equal(seven.tests.length, 5);
  assert.equal(seven.tests[4].testTimestamp, "2026-07-12T10:00:00Z");
});

test("selectCmjBaseline: tests every 2-3 weeks can now flag, which 3 tests in 42 days ruled out", () => {
  const s = selectCmjBaseline("2026-08-27T10:00:00Z", [t("2026-08-07T10:00:00Z"), t("2026-07-18T10:00:00Z"), t("2026-06-29T10:00:00Z")]);
  assert.equal(s.status, "ready");
});

test("selectCmjBaseline: a return after more than 21 days cannot flag, whatever came before", () => {
  // Breiðablik on 2026-10-14: plenty of earlier tests, the last one 48 days back.
  const s = selectCmjBaseline("2026-10-14T10:00:00Z", ["08-27", "08-22", "08-14", "08-07", "08-02", "07-30"].map((d) => t(`2026-${d}T10:00:00Z`)));
  assert.equal(s.status, "gap");
  assert.equal(s.daysSincePrevious, 48);
  assert.equal(s.tests.length, 5, "kept for the plain comparison");
  assert.equal(selectCmjBaseline("2026-08-22T10:00:00Z", [t("2026-08-01T10:00:00Z"), t("2026-07-25T10:00:00Z"), t("2026-07-20T10:00:00Z")]).status, "ready", "exactly 21 days is not a gap");
  assert.equal(selectCmjBaseline("2026-08-23T10:00:00Z", [t("2026-08-01T10:00:00Z"), t("2026-07-25T10:00:00Z"), t("2026-07-20T10:00:00Z")]).status, "gap");
});

test("selectCmjBaseline: a second test the same day does not hide a gap", () => {
  const s = selectCmjBaseline("2026-10-14T11:00:00Z", [t("2026-10-14T10:00:00Z"), t("2026-08-27T10:00:00Z"), t("2026-08-22T10:00:00Z")]);
  assert.equal(s.status, "gap");
  assert.equal(s.daysSincePrevious, 48);
});

test("selectCmjBaseline: too few tests, tests older than 90 days and no test at all", () => {
  assert.equal(selectCmjBaseline("2026-07-22T10:00:00Z", [t("2026-07-15T10:00:00Z"), t("2026-07-10T10:00:00Z")]).status, "too_few");
  assert.equal(selectCmjBaseline("2026-10-14T10:00:00Z", [t("2026-07-01T10:00:00Z")]).status, "no_prior");
  assert.equal(selectCmjBaseline("2026-10-14T10:00:00Z", []).status, "no_prior");
  assert.equal(selectCmjBaseline(null, [t("2026-07-01T10:00:00Z")]).status, "no_prior");
});

test("currentValdFlag: only a fresh test is today's state", () => {
  assert.equal(currentValdFlag("red", "fresh"), "red");
  assert.equal(currentValdFlag("red", "stale"), null);
  assert.equal(currentValdFlag("yellow", "missing"), null);
});

test("worstValdFlag: stale flags already removed leave the overall empty, not green", () => {
  assert.equal(worstValdFlag([null, "green", "red"]), "red");
  assert.equal(worstValdFlag(["green", "yellow"]), "yellow");
  assert.equal(worstValdFlag([null, "green"]), "green");
  assert.equal(worstValdFlag([null, null, null]), null);
});

test("buildCmjReturnRead: names the gap and the comparison, in both languages, and says it does not flag", () => {
  const r = buildCmjReturnRead({ latest: 48.2, baseline: 50.4, comparedTests: 5, daysSincePrevious: 48 });
  assert.equal(Math.round(r.delta_percent! * 10) / 10, -4.4);
  assert.match(r.message.en, /First jump test in 48 days: 48\.2 cm, 4\.4% below the last 5 tests/);
  assert.match(r.message.en, /no flag and no trim/);
  assert.match(r.message.is, /Fyrsta hoppróf í 48 daga: 48\.2 cm, 4\.4% undir síðustu 5 prófum/);
  const above = buildCmjReturnRead({ latest: 43, baseline: 41, comparedTests: 1, daysSincePrevious: 30 });
  assert.match(above.message.en, /above the last test\./);
  const none = buildCmjReturnRead({ latest: 40, baseline: null, comparedTests: 0, daysSincePrevious: 30 });
  assert.equal(none.delta_percent, null);
  assert.match(none.message.en, /^First jump test in 30 days: 40\.0 cm\. Too long/);
});

test("strengthRetestList: the newest old test with a gap needs a retest; a fresh or even test does not", () => {
  const rows = [
    { playerId: "old-gap", testTimestamp: "2025-01-30T10:00:00Z", asymPct: 18 },
    { playerId: "fresh-gap", testTimestamp: "2026-11-01T10:00:00Z", asymPct: 18 },
    { playerId: "old-even", testTimestamp: "2025-01-30T10:00:00Z", asymPct: 4 },
    { playerId: "no-peaks", testTimestamp: "2025-01-30T10:00:00Z", asymPct: null },
    // Only the newest test of a player counts: this older gap was re-tested and is even now.
    { playerId: "fresh-gap", testTimestamp: "2024-01-30T10:00:00Z", asymPct: 30 },
    { playerId: "old-even", testTimestamp: "2024-01-30T10:00:00Z", asymPct: 30 },
  ];
  const list = strengthRetestList(rows, "2026-11-06", 14);
  assert.deepEqual(list.map((e) => e.playerId), ["old-gap"]);
  assert.equal(list[0].ageDays, 645);
  assert.equal(strengthRetestList([{ playerId: "p", testTimestamp: "2026-10-23T10:00:00Z", asymPct: 12 }], "2026-11-06", 14).length, 0, "14 days old is inside the window");
  assert.equal(strengthRetestList([{ playerId: "p", testTimestamp: "2026-10-22T10:00:00Z", asymPct: 12 }], "2026-11-06", 14).length, 1);
});

import { test } from "vitest";
import assert from "node:assert/strict";
import { classifyInSeasonSubPhase, inSeasonSubPhaseWeeks, mondayOf, SUBPHASE_KEYS, subPhaseInfo } from "../inSeasonSubPhase";

// A normal one-match week (Sat game, next game the following Sat) → sharpen.
test("normal one-match week → sharpen", () => {
  const fixtures = ["2026-05-02", "2026-05-09", "2026-05-16"];
  const r = classifyInSeasonSubPhase({ weekStart: "2026-05-04", fixtures, competitiveEnd: "2026-10-01" });
  assert.equal(r.key, "sharpen");
});

// Two games in one week → maintain_potentiate (congested).
test("2-game week → maintain + potentiate", () => {
  const fixtures = ["2026-05-02", "2026-05-06", "2026-05-09"]; // Sat + Wed + Sat
  const r = classifyInSeasonSubPhase({ weekStart: "2026-05-04", fixtures, competitiveEnd: "2026-10-01" });
  assert.equal(r.key, "maintain_potentiate");
});

// A single game with a ≤3-day turnaround into the next (Sat then Tue) → congested too.
test("single game with a 3-day turnaround → maintain + potentiate", () => {
  const fixtures = ["2026-05-02", "2026-05-05"]; // Sat, then Tue (next week), gap 3 days
  const r = classifyInSeasonSubPhase({ weekStart: "2026-04-27", fixtures, competitiveEnd: "2026-10-01" });
  assert.equal(r.key, "maintain_potentiate");
});

// A long fixture gap with a blank week in the middle → re-strength.
test("blank week inside a long gap → re-strength", () => {
  const fixtures = ["2026-05-02", "2026-05-30"]; // 28-day gap → the middle week is blank
  const r = classifyInSeasonSubPhase({ weekStart: "2026-05-13", fixtures, competitiveEnd: "2026-10-01" });
  assert.equal(r.key, "re_strength");
});

// A declared break week (no match) → re-strength even if the surrounding gap is shorter.
test("declared break week → re-strength", () => {
  const fixtures = ["2026-05-02", "2026-05-23"];
  const r = classifyInSeasonSubPhase({
    weekStart: "2026-05-11", fixtures, competitiveEnd: "2026-10-01",
    breaks: [{ start_date: "2026-05-11", end_date: "2026-05-17" }],
  });
  assert.equal(r.key, "re_strength");
});

// A one-match week inside the final run-in weeks → taper.
test("one-match week in the run-in → taper", () => {
  const fixtures = ["2026-09-19", "2026-09-26"]; // season ends 2026-09-27
  const r = classifyInSeasonSubPhase({ weekStart: "2026-09-21", fixtures, competitiveEnd: "2026-09-27", runInWeeks: 3 });
  assert.equal(r.key, "taper");
});

// The same early-season one-match week is NOT taper (outside the run-in).
test("one-match week far from season end → sharpen, not taper", () => {
  const fixtures = ["2026-05-02", "2026-05-09"];
  const r = classifyInSeasonSubPhase({ weekStart: "2026-05-04", fixtures, competitiveEnd: "2026-09-27", runInWeeks: 3 });
  assert.equal(r.key, "sharpen");
});

// Congestion wins even in the run-in (a congested final week is maintain, not taper).
test("congested run-in week stays maintain + potentiate", () => {
  const fixtures = ["2026-09-20", "2026-09-23", "2026-09-26"];
  const r = classifyInSeasonSubPhase({ weekStart: "2026-09-21", fixtures, competitiveEnd: "2026-09-27", runInWeeks: 3 });
  assert.equal(r.key, "maintain_potentiate");
});

test("inSeasonSubPhaseWeeks enumerates Monday-aligned weeks across the span", () => {
  const weeks = inSeasonSubPhaseWeeks({
    competitiveStart: "2026-05-01", competitiveEnd: "2026-05-28",
    fixtures: ["2026-05-02", "2026-05-09", "2026-05-16", "2026-05-23"], today: "2026-05-12",
  });
  assert.ok(weeks.length >= 4 && weeks.length <= 5);
  assert.ok(weeks.every((w) => w.weekStart === mondayOf(w.weekStart)));
  assert.equal(weeks.filter((w) => w.isNow).length, 1); // the week of 2026-05-12
  assert.ok(weeks.every((w) => SUBPHASE_KEYS.includes(w.sub.key)));
});

test("subPhaseInfo carries bilingual labels + a citation for every key", () => {
  for (const k of SUBPHASE_KEYS) {
    const info = subPhaseInfo(k);
    assert.ok(info.label.en && info.label.is, `label for ${k}`);
    assert.ok(info.rationale.en && info.rationale.is, `rationale for ${k}`);
    assert.ok(info.cite.length > 0, `cite for ${k}`);
  }
});

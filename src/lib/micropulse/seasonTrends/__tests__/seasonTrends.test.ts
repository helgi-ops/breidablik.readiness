import { test } from "vitest";
import assert from "node:assert/strict";
import { buildSeasonTrends, type SeasonSessionRow } from "../index";
import type { ClockGrid } from "../../directionalSignature";

const fwdClock: ClockGrid = { "12": { high: 100, medium: 20, low: 5 }, "6": { high: 10, medium: 5, low: 2 }, "3": { high: 8, medium: 4, low: 2 } };

function match(date: string, hsr: number, efforts: number): SeasonSessionRow {
  return { date, isMatch: true, hsrM: hsr, accel: null, decel: null, accelDecelEfforts: efforts, durationMin: 90, clock: fwdClock };
}

test("HSR match trend reads UP when recent matches exceed earlier ones", () => {
  const rows: SeasonSessionRow[] = [
    match("2026-07-01", 400, 90), match("2026-07-08", 420, 92), match("2026-07-15", 410, 88),
    match("2026-07-22", 560, 100), match("2026-08-01", 600, 110), match("2026-08-08", 590, 108),
  ];
  const t = buildSeasonTrends(rows);
  assert.equal(t.scope, "match");         // ≥5 matches → match scope
  assert.equal(t.n, 6);
  assert.equal(t.hsr?.trend, "up");
  assert.equal(t.hsr?.latest, 590);
  assert.ok((t.hsr?.rollingMean ?? 0) > 0);
});

test("falls back to 'all' scope when there are <5 matches", () => {
  const rows: SeasonSessionRow[] = [
    { ...match("2026-08-01", 300, 80), isMatch: false },
    { ...match("2026-08-03", 310, 82), isMatch: false },
    match("2026-08-08", 500, 100),
  ];
  const t = buildSeasonTrends(rows);
  assert.equal(t.scope, "all");           // only 1 match → all sessions
  assert.equal(t.n, 3);
});

test("directional balance reads forward-dominant from a forward-weighted clock", () => {
  const rows = Array.from({ length: 5 }, (_, i) => match(`2026-08-0${i + 1}`, 500, 100));
  const t = buildSeasonTrends(rows);
  assert.ok(t.direction);
  assert.ok(t.direction!.forward > t.direction!.backward);
  assert.ok(t.direction!.forward > t.direction!.lateral);
  assert.match(t.verdict.en, /forward-dominant/);
});

test("IMA density is per-minute and present; HSR labelled per session/match, never a peak window", () => {
  const rows = Array.from({ length: 5 }, (_, i) => match(`2026-08-0${i + 1}`, 500, 90)); // 90 efforts / 90 min = 1.0/min
  const t = buildSeasonTrends(rows);
  assert.equal(t.imaDensity?.latest, 1);
  assert.ok(t.facts.some((f) => /per match/.test(f.en) && />19\.8 km\/h/.test(f.en)));
});

test("no data → nulls, low confidence, no crash", () => {
  const t = buildSeasonTrends([]);
  assert.equal(t.hsr, null);
  assert.equal(t.direction, null);
  assert.equal(t.confidence, "low");
});

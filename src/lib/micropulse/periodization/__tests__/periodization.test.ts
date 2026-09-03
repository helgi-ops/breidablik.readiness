import { test } from "vitest";
import assert from "node:assert/strict";
import { detectSeasonPhases, buildMesoBlocks, intervalSpeedsFromMas, strengthFromVbt, dataReadiness, type WeekLoad } from "../index";

test("detectSeasonPhases: pre-season before first fixture + competitive across the fixtures", () => {
  const fixtures = [{ date: "2026-04-10" }, { date: "2026-05-01" }, { date: "2026-09-11" }];
  const ph = detectSeasonPhases(fixtures, "2026-02-02");
  assert.equal(ph.length, 2);
  assert.equal(ph[0].key, "preseason");
  assert.equal(ph[0].start, "2026-02-02");   // data start (before first fixture)
  assert.equal(ph[0].end, "2026-04-10");
  assert.equal(ph[1].key, "competitive");
  assert.equal(ph[1].matches, 3);
  assert.match(ph[1].rationale.en, /3 matches/);
});

test("buildMesoBlocks: flags a load spike as a deload and rotates goals", () => {
  // 12 weeks; a clear spike in block 2 (weeks 5-8) vs the prior 4-week chronic.
  const weeks: WeekLoad[] = [];
  const base = Date.parse("2026-04-06");
  for (let i = 0; i < 12; i++) {
    const load = i >= 4 && i < 8 ? 4200 : 2000; // block 2 doubles the load → ACWR spike
    weeks.push({ weekStart: new Date(base + i * 7 * 86_400_000).toISOString().slice(0, 10), load, readiness: 70 });
  }
  const blocks = buildMesoBlocks("2026-04-06", "2026-06-29", weeks, 4);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].phase.en, "Accumulation");
  const spiked = blocks[1];
  assert.ok(spiked.acwr != null && spiked.acwr > 1.3);   // measured from the real load
  assert.equal(spiked.isDeload, true);
  assert.match(spiked.flag!.en, /spike/i);
  assert.ok(spiked.volumeTargetPct != null && spiked.volumeTargetPct < 100); // cuts volume
});

test("intervalSpeedsFromMas: Type 1–5 km/h scale off MAS", () => {
  const z = intervalSpeedsFromMas(17.5);
  assert.equal(z.length, 5);
  assert.equal(z[0].type, 1);
  assert.equal(z[3].pctMas, 105);
  assert.equal(z[3].kmh, Math.round(17.5 * 1.05 * 10) / 10);  // VO2max at MAS
  assert.ok(z[4].kmh! > z[0].kmh!);                            // speed > recovery
  const none = intervalSpeedsFromMas(null);
  assert.equal(none[0].kmh, null);                             // no MAS → no fabricated number
});

test("strengthFromVbt: velocity zone from the latest heavy set", () => {
  assert.equal(strengthFromVbt("Squat", 130, 0.42)!.zone.en, "max strength");
  assert.equal(strengthFromVbt("Squat", 100, 0.62)!.zone.en, "strength–speed");
  assert.equal(strengthFromVbt("Squat", 60, 0.9)!.zone.en, "speed–strength");
  assert.equal(strengthFromVbt(null, null, null), null);
});

test("dataReadiness: names the gaps (no CS test, stale VBT) instead of faking", () => {
  const gaps = dataReadiness({ hasCsTest: false, masAgeDays: 17, vbtAgeDays: 150, hasValdThisBlock: false });
  assert.ok(gaps.find((g) => g.key === "cs" && /running-test MAS/.test(g.message.en))); // CS missing → MAS fallback named
  assert.ok(gaps.find((g) => g.key === "vbt" && g.severity === "stale" && /150 days/.test(g.message.en)));
  assert.ok(gaps.find((g) => g.key === "vald" && g.severity === "missing"));
});

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  computeHrLoad,
  summatedHrZoneLoad,
  hrZoneDistribution,
  estimateHrMax,
  matchIntensityAnchor,
  DIVERGENCE_GAP,
  MIN_MATURE_HR_SESSIONS,
  type HrLoadRow,
  type HrBand,
} from "../index";

// A band with measured avg bpm + seconds of time (pct is irrelevant to the anchor).
const hb = (band: number, timeS: number | null, avgBpm: number | null): HrBand => ({ band, timeS, pct: null, avgBpm });

// Convenience: N minutes in a single band → seconds.
const min = (m: number) => m * 60;

function row(date: string, over: Partial<HrLoadRow> = {}): HrLoadRow {
  return { date, srpeLoad: null, hrZonesSec: [], pctMaxHr: null, ...over };
}

test("summatedHrZoneLoad = Σ (minutes × band ordinal); missing bands skipped, null when none", () => {
  // 10 min in band 1 (×1) + 5 min in band 5 (×5) = 10 + 25 = 35 AU.
  const zones = [min(10), null, null, null, min(5), null, null, null];
  assert.equal(summatedHrZoneLoad(zones), 35);
  // Higher bands weigh more: same 15 min all in band 8 = 15 × 8 = 120.
  assert.equal(summatedHrZoneLoad([null, null, null, null, null, null, null, min(15)]), 120);
  // No band data → null, never 0.
  assert.equal(summatedHrZoneLoad([null, null, null, null, null, null, null, null]), null);
  assert.equal(summatedHrZoneLoad([]), null);
});

// A mature baseline of aligned sessions, so indices sit near 100.
function baselineRows(): HrLoadRow[] {
  return Array.from({ length: MIN_MATURE_HR_SESSIONS }, (_, i) =>
    row(`2026-07-0${i + 1}`, {
      srpeLoad: 300,
      // ~ balanced HR distribution giving a stable per-session HR load
      hrZonesSec: [min(10), min(10), min(10), min(10), min(5), null, null, null],
      pctMaxHr: 88,
    }),
  );
}

test("hidden load: heart says HARD while RPE says easy → hidden_load flag", () => {
  const rows = baselineRows();
  // Latest: sRPE well below the player's norm, but HR load well above it.
  rows.push(
    row("2026-07-20", {
      srpeLoad: 120, // low vs baseline 300
      hrZonesSec: [null, null, min(5), min(10), min(15), min(10), min(5), null], // heavy top-band time
      pctMaxHr: 94,
    }),
  );
  const read = computeHrLoad(rows);
  assert.equal(read.latest?.alignment, "hidden_load");
  assert.ok((read.latest?.gap ?? 0) >= DIVERGENCE_GAP, `gap ${read.latest?.gap}`);
});

test("low cardiac response: RPE high but heart quiet → low_cardio_response flag", () => {
  const rows = baselineRows();
  rows.push(
    row("2026-07-20", {
      srpeLoad: 600, // high vs baseline 300
      hrZonesSec: [min(20), min(5), null, null, null, null, null, null], // mostly low bands
      pctMaxHr: 70,
    }),
  );
  const read = computeHrLoad(rows);
  assert.equal(read.latest?.alignment, "low_cardio_response");
  assert.ok((read.latest?.gap ?? 0) <= -DIVERGENCE_GAP, `gap ${read.latest?.gap}`);
});

test("aligned: heart and RPE agree within the noise band", () => {
  const rows = baselineRows();
  rows.push(
    row("2026-07-20", {
      srpeLoad: 300,
      hrZonesSec: [min(10), min(10), min(10), min(10), min(5), null, null, null],
      pctMaxHr: 88,
    }),
  );
  const read = computeHrLoad(rows);
  assert.equal(read.latest?.alignment, "aligned");
});

test("no belt → HR null, sRPE-only session is insufficient to cross-check (never fabricated)", () => {
  const rows = baselineRows();
  rows.push(row("2026-07-20", { srpeLoad: 400, hrZonesSec: [], pctMaxHr: null })); // RPE logged, no belt
  const read = computeHrLoad(rows);
  assert.equal(read.latest?.hrLoad, null);
  assert.equal(read.latest?.alignment, "insufficient");
  assert.equal(read.dataCoverage.hasHr, true); // baseline had HR
});

test("thin HR baseline can't cross-check yet → insufficient, low confidence", () => {
  const rows = [
    row("2026-07-18", { srpeLoad: 300, hrZonesSec: [min(10), min(10)], pctMaxHr: 85 }),
    row("2026-07-20", { srpeLoad: 500, hrZonesSec: [null, null, min(20), min(10)], pctMaxHr: 92 }),
  ];
  const read = computeHrLoad(rows); // only 2 HR sessions < MIN_MATURE_HR_SESSIONS
  assert.equal(read.latest?.alignment, "insufficient");
  assert.equal(read.confidence, "low");
});

test("confidence needs a mature HR baseline AND %HRmax (HRmax set)", () => {
  const withPct = baselineRows().concat(baselineRows().map((r, i) => ({ ...r, date: `2026-08-0${i + 1}` })));
  assert.equal(computeHrLoad(withPct).confidence, "high"); // ≥ 2× mature, %HRmax present

  const noPct = baselineRows().map((r) => ({ ...r, pctMaxHr: null }));
  assert.equal(computeHrLoad(noPct).confidence, "low"); // HRmax not set → capped low
});

test("hrZoneDistribution: %-of-session + bpm label per band, null-safe", () => {
  // 600 + 300 + 100 = 1000 s total → 60 / 30 / 10 %.
  const dist = hrZoneDistribution(
    [min(10), null, null, null, min(5), null, null, min(100 / 60)],
    [120, null, null, null, 165, null, null, 188.4],
  );
  assert.equal(dist.length, 8);
  assert.equal(dist[0].band, 1);
  assert.equal(dist[0].timeS, 600);
  assert.equal(dist[0].pct, 60);
  assert.equal(dist[0].avgBpm, 120);
  assert.equal(dist[4].pct, 30);
  assert.equal(dist[4].avgBpm, 165);
  assert.equal(dist[7].avgBpm, 188); // rounded label
  // A band with no time → null time + null pct, never 0%.
  assert.equal(dist[1].timeS, null);
  assert.equal(dist[1].pct, null);
});

test("hrZoneDistribution with no HR time → all pct null, never fabricated", () => {
  const dist = hrZoneDistribution([], []);
  assert.equal(dist.length, 8);
  assert.ok(dist.every((b) => b.timeS === null && b.pct === null));
});

test("empty input is safe", () => {
  const read = computeHrLoad([]);
  assert.equal(read.latest, null);
  assert.equal(read.baseline.avgHrLoad, null);
  assert.equal(read.confidence, "low");
});

test("every alignment verdict exists in EN and IS", () => {
  const rows = baselineRows();
  rows.push(row("2026-07-20", { srpeLoad: 120, hrZonesSec: [null, null, min(5), min(10), min(15), min(10)], pctMaxHr: 94 }));
  const read = computeHrLoad(rows);
  for (const s of read.history) {
    assert.ok(s.verdict.en.trim().length > 0);
    assert.ok(s.verdict.is.trim().length > 0);
    assert.notEqual(s.verdict.en, s.verdict.is);
  }
  assert.ok(read.caveat.en && read.caveat.is && read.caveat.en !== read.caveat.is);
});

test("estimateHrMax: Tanaka by default, Gulati for women, null for absent/implausible age", () => {
  // Tanaka 208 − 0.7·age. At 40: 208 − 28 = 180.
  assert.equal(estimateHrMax(40), 180);
  assert.equal(estimateHrMax(40, "M"), 180);
  // Gulati 206 − 0.88·age for women. At 40: 206 − 35.2 = 170.8 → 171.
  assert.equal(estimateHrMax(40, "F"), 171);
  // Never fabricate from a missing or nonsensical age.
  assert.equal(estimateHrMax(null), null);
  assert.equal(estimateHrMax(undefined), null);
  assert.equal(estimateHrMax(4), null);
  assert.equal(estimateHrMax(95), null);
});

// ── Match-intensity anchor (Bangsbo) ─────────────────────────────────────────
// HRmax 200 → 65% = 130 bpm, 85% = 170 bpm.
const CALIB = { effectiveHrMax: 200, hrMaxSource: "set" as const };

test("anchor: mean ≥85% HRmax → match-intensity verdict", () => {
  const r = matchIntensityAnchor({ bands: [hb(6, min(20), 175)], ...CALIB, meanPctHrMax: 86, peakPctHrMax: 94 })!;
  assert.equal(r.tier, "match");
  assert.equal(r.atMatchIntensity, true);
  assert.match(r.verdict.en, /match intensity/i);
  assert.match(r.citation, /Bangsbo/);
});

test("anchor: peak ≥98% HRmax flags the ceiling", () => {
  const r = matchIntensityAnchor({ bands: [hb(7, min(15), 180)], ...CALIB, meanPctHrMax: 88, peakPctHrMax: 99 })!;
  assert.equal(r.hitCeiling, true);
  assert.match(r.verdict.en, /ceiling/i);
});

test("anchor: lots of time <65% HRmax → low-intensity day", () => {
  // 30 min at 120 bpm (below 130 = 65%) + 10 min at 150 bpm → 75% low → low day.
  const r = matchIntensityAnchor({ bands: [hb(2, min(30), 120), hb(4, min(10), 150)], ...CALIB, meanPctHrMax: 63, peakPctHrMax: 80 })!;
  assert.equal(r.tier, "low");
  assert.equal(r.lowIntensityPct, 75);
  assert.match(r.verdict.en, /low-intensity day/i);
});

test("anchor: moderate when mean is between low and match", () => {
  const r = matchIntensityAnchor({ bands: [hb(5, min(20), 160)], ...CALIB, meanPctHrMax: 78, peakPctHrMax: 90 })!;
  assert.equal(r.tier, "moderate");
  assert.match(r.verdict.en, /below the ~85%/i);
});

test("anchor: null (falls back to ordinal bands) when HRmax is only an age estimate", () => {
  assert.equal(matchIntensityAnchor({ bands: [hb(5, min(20), 160)], effectiveHrMax: 195, hrMaxSource: "estimated", meanPctHrMax: 86, peakPctHrMax: 94 }), null);
});

test("anchor: null when HRmax missing or mean %HRmax unknown", () => {
  assert.equal(matchIntensityAnchor({ bands: [hb(5, min(20), 160)], effectiveHrMax: null, hrMaxSource: "none", meanPctHrMax: 86, peakPctHrMax: null }), null);
  assert.equal(matchIntensityAnchor({ bands: [hb(5, min(20), 160)], ...CALIB, meanPctHrMax: null, peakPctHrMax: null }), null);
});

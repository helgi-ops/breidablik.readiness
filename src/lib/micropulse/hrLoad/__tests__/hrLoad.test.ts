import { test } from "vitest";
import assert from "node:assert/strict";
import {
  computeHrLoad,
  summatedHrZoneLoad,
  hrZoneDistribution,
  DIVERGENCE_GAP,
  MIN_MATURE_HR_SESSIONS,
  type HrLoadRow,
} from "../index";

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

import { test } from "vitest";
import assert from "node:assert/strict";
import { computeTeamOutlook, expectedFromDays, type OutlookPlayerInput, type PlannedDay } from "../index";
import type { PlayerHistory } from "../features";

function isoAdd(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Synthesise a player whose wellness genuinely falls with recent load, with real
 * class variety (heavy / normal / light weeks cycle) so the ordinal model has signal.
 * wellness(d) = 24 − (load[d-1]+load[d-2]+load[d-3]) / 150, clamped to 5..25.
 */
function makePlayer(id: string, end: string, weeks: number): OutlookPlayerInput {
  const loadByDate = new Map<string, number>();
  const wellnessByDate = new Map<string, number>();
  const mdOffsetByDate = new Map<string, number>();
  const days = weeks * 7;
  const weeklyLoads: number[] = [];
  let weekAcc = 0;
  for (let i = days; i >= 0; i--) {
    const d = isoAdd(end, -i);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const weekIdx = Math.floor((days - i) / 7);
    const mult = weekIdx % 3 === 0 ? 1.7 : weekIdx % 3 === 1 ? 1.0 : 0.6;
    const base = dow === 0 || dow === 1 ? 0 : dow === 6 ? 650 : dow >= 3 ? 420 : 250;
    const load = Math.round(base * mult);
    loadByDate.set(d, load);
    mdOffsetByDate.set(d, dow === 6 ? 0 : dow === 5 ? -1 : dow === 4 ? -2 : dow === 3 ? -3 : dow === 2 ? -4 : -5);
    weekAcc += load;
    if (dow === 0) { weeklyLoads.push(weekAcc); weekAcc = 0; }
    const recent = (loadByDate.get(isoAdd(d, -1)) ?? 0) + (loadByDate.get(isoAdd(d, -2)) ?? 0) + (loadByDate.get(isoAdd(d, -3)) ?? 0);
    wellnessByDate.set(d, Math.max(5, Math.min(25, Math.round(24 - recent / 150))));
  }
  const history: PlayerHistory = { loadByDate, wellnessByDate, mdOffsetByDate };
  return { playerId: id, playerName: `Player ${id}`, history, weeksOfData: weeks, weeklyLoads: weeklyLoads.slice(-8) };
}

const squad = () => Array.from({ length: 6 }, (_, i) => makePlayer(`p${i}`, "2026-06-30", 30));

// A brutal 3-day block that should dip the days after it; a light plan for comparison.
const brutalPlan: PlannedDay[] = [
  { date: isoAdd("2026-06-30", 1), mdOffset: -4, plannedLoad: 950, mdLabel: "MD-4" },
  { date: isoAdd("2026-06-30", 2), mdOffset: -3, plannedLoad: 950, mdLabel: "MD-3" },
  { date: isoAdd("2026-06-30", 3), mdOffset: -2, plannedLoad: 900, mdLabel: "MD-2" },
];
const lightPlan: PlannedDay[] = brutalPlan.map((d) => ({ ...d, plannedLoad: 120 }));

test("withholds a forecast for a thin-history player (no green on no-data)", () => {
  const res = computeTeamOutlook([makePlayer("thin", "2026-06-30", 3)], brutalPlan);
  const p = res.players[0];
  assert.equal(p.confidence.level, "withheld");
  assert.equal(p.days.length, 0);
  assert.equal(p.flagged, false);
  assert.equal(p.why, null);
});

test("mature squad: per-day ±1 bands, valid distributions, and a holdout accuracy", () => {
  const res = computeTeamOutlook(squad(), brutalPlan);
  assert.ok(res.sampleCount > 100, `expected many samples, got ${res.sampleCount}`);
  assert.ok(res.modelWithin1 != null && res.modelWithin1 > 0.5, `holdout within±1 weak: ${res.modelWithin1}`);
  // The naive persistence baseline is computed alongside so the surface can show the lift.
  assert.ok(res.naiveWithin1 != null && res.naiveWithin1 >= 0 && res.naiveWithin1 <= 1, `naive baseline should be a fraction: ${res.naiveWithin1}`);
  const p = res.players[0];
  assert.notEqual(p.confidence.level, "withheld");
  assert.equal(p.days.length, 3);
  for (const d of p.days) {
    assert.ok(d.bandLow <= d.classArgmax && d.classArgmax <= d.bandHigh, "band brackets the argmax");
    assert.ok(d.bandHigh - d.bandLow <= 2, "±1 band spans ≤2 classes");
    assert.ok(Math.abs(d.probs.reduce((s, v) => s + v, 0) - 1) < 1e-9, "probs sum to 1");
  }
});

test("the plan moves the forecast: a brutal week outlooks lower than a light week", () => {
  const brutal = computeTeamOutlook(squad(), brutalPlan);
  const light = computeTeamOutlook(squad(), lightPlan);
  // Squad mean of each player's worst-day expected class must be lower under the brutal plan.
  const meanWorst = (r: ReturnType<typeof computeTeamOutlook>) => {
    const vals = r.players.map((p) => (p.worstDay ? expectedFromDays(p.days) : null)).filter((v): v is number => v != null);
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  };
  const brutalMean = meanWorst(brutal);
  const lightMean = meanWorst(light);
  assert.ok(brutalMean < lightMean, `brutal plan should outlook lower (${brutalMean.toFixed(2)}) than light (${lightMean.toFixed(2)})`);
});

test("a flagged dip carries a bilingual why and a real counterfactual", () => {
  const res = computeTeamOutlook(squad(), brutalPlan);
  const flagged = res.players.filter((p) => p.flagged);
  assert.ok(flagged.length > 0, "a brutal block on a load-sensitive squad should flag a dip");
  for (const p of flagged) {
    assert.ok(p.worstDay?.dip);
    assert.ok(p.why && p.why.en && p.why.is && p.why.en !== p.why.is, "flagged player has a bilingual why");
    assert.ok(p.counterfactual && p.counterfactual.en.length > 0, "flagged player has a counterfactual");
    // Counterfactual names an earlier planned day and either lifts or honestly doesn't.
    assert.ok(/MD-|earlier|lift|barely|accumulated|hækka|breytir|uppsöfnuðu/i.test(p.counterfactual!.en + p.counterfactual!.is));
  }
});

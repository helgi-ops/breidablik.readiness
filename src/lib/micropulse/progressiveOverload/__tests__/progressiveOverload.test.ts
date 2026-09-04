import { test } from "vitest";
import assert from "node:assert/strict";
import { buildProgressiveOverload } from "../index";
import type { LoadRow } from "@/lib/micropulse/loadPlan";

// Minimal GPS rows: training days (moderate PL) + a few high-PL match days, for two players.
function rowsFor(sessionDate: string): LoadRow[] {
  const out: LoadRow[] = [];
  const base = Date.parse(sessionDate);
  const mk = (pid: string, dayBack: number, pl: number, dist: number, hsr: number): LoadRow =>
    ({ player_id: pid, date: new Date(base - dayBack * 86_400_000).toISOString().slice(0, 10),
       total_player_load: pl, total_distance: dist, velocity_band5_total_distance: hsr, velocity_band6_total_distance: Math.round(hsr * 0.3) } as unknown as LoadRow);
  for (let d = 1; d <= 24; d++) {
    const match = d % 8 === 0; // ~3 high days
    out.push(mk("p1", d, match ? 900 : 420, match ? 11000 : 6200, match ? 900 : 320));
    out.push(mk("p2", d, match ? 850 : 500, match ? 10500 : 7000, match ? 850 : 380));
  }
  return out;
}
const nameById = new Map([["p1", "Óli"], ["p2", "Björn"]]);

test("buildProgressiveOverload: focusPlayerId scopes the whole projection to one player", () => {
  const rows = rowsFor("2026-01-30");
  const team = buildProgressiveOverload({ sessionDate: "2026-01-30", weeks: 5, rows, nameById });
  const solo = buildProgressiveOverload({ sessionDate: "2026-01-30", weeks: 5, rows, nameById, focusPlayerId: "p1" });
  assert.ok(team.perPlayer.length === 2);
  assert.equal(solo.perPlayer.length, 1);
  assert.equal(solo.perPlayer[0].player_id, "p1");
  assert.ok(solo.hasData);
});

test("buildProgressiveOverload: focusing a player with no GPS falls back to the squad build (bias dropped)", () => {
  const rows = rowsFor("2026-01-30"); // only p1 + p2 have rows
  const names = new Map([...nameById, ["p3", "Gunnar"]]);
  const solo = buildProgressiveOverload({ sessionDate: "2026-01-30", weeks: 5, rows, nameById: names, focusPlayerId: "p3", emphasis: { hsr: 1.5 } });
  assert.equal(solo.fellBackToTeam, true);
  assert.ok(solo.hasData);                     // the squad has data, so the coach still gets a plan
  assert.equal(solo.perPlayer.length, 2);      // team build (p1 + p2), not the empty p3
  // Bias is dropped on fallback — HSR ramps at its base rate, not the emphasised one.
  const teamNeutral = buildProgressiveOverload({ sessionDate: "2026-01-30", weeks: 5, rows, nameById: names });
  const hsrRate = (p: typeof solo) => p.ramps.find((r) => r.kpi === "hsr")?.ratePct ?? 0;
  assert.equal(hsrRate(solo), hsrRate(teamNeutral));
});

test("buildProgressiveOverload: emphasis lifts the weekly RATE of the biased KPIs, still capped", () => {
  const rows = rowsFor("2026-01-30");
  const neutral = buildProgressiveOverload({ sessionDate: "2026-01-30", weeks: 5, rows, nameById, focusPlayerId: "p1" });
  const steered = buildProgressiveOverload({ sessionDate: "2026-01-30", weeks: 5, rows, nameById, focusPlayerId: "p1", emphasis: { hsr: 1.5 } });
  const hsrRate = (p: typeof neutral) => p.ramps.find((r) => r.kpi === "hsr")?.ratePct ?? 0;
  const plRate = (p: typeof neutral) => p.ramps.find((r) => r.kpi === "playerLoad")?.ratePct ?? 0;
  assert.ok(hsrRate(steered) > hsrRate(neutral), "biased HSR ramps at a higher rate");
  assert.equal(plRate(steered), plRate(neutral), "un-emphasised KPIs are unchanged");
  // The match ceiling still bounds it — no HSR week target exceeds the match reference.
  const hsr = steered.ramps.find((r) => r.kpi === "hsr")!;
  if (hsr.matchRef != null) for (const w of hsr.weeks) if (w.target != null) assert.ok(w.target <= hsr.matchRef);
});

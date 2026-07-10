import { describe, it, expect } from "vitest";
import {
  csvRowsToPeriodRows,
  aggregatePeriodsPerPlayer,
  matchPeriodsToItems,
  isSessionTotalName,
  type SessionItem,
} from "../index";

// Minimal CSV row helper (only the fields csvRowsToPeriodRows reads).
function row(period: string, athlete: string, pl: number, dist: number) {
  return { periodName: period, athleteId: athlete, athleteName: athlete, raw: { playerLoad: String(pl), totalDistance: String(dist) } };
}

describe("csvRowsToPeriodRows + isSessionTotalName", () => {
  it("drops Session-total and unnamed rows, keeps drills in first-appearance order", () => {
    const rows = [
      row("Session", "A", 300, 5000),
      row("Warm-up", "A", 80, 700),
      row("Rondo", "A", 120, 900),
      row("", "A", 10, 10),
    ];
    const out = csvRowsToPeriodRows(rows);
    expect(out.map((r) => r.periodName)).toEqual(["Warm-up", "Rondo"]);
    expect(out[0].order).toBe(0);
    expect(out[1].order).toBe(1);
  });
  it("isSessionTotalName catches session/total/blank", () => {
    expect(isSessionTotalName("Session")).toBe(true);
    expect(isSessionTotalName("Total")).toBe(true);
    expect(isSessionTotalName("")).toBe(true);
    expect(isSessionTotalName("Rondo")).toBe(false);
  });
});

describe("aggregatePeriodsPerPlayer", () => {
  it("averages each metric per player across the squad", () => {
    const rows = csvRowsToPeriodRows([
      row("Rondo", "A", 100, 800),
      row("Rondo", "B", 140, 1000),
      row("Rondo", "C", 120, 900),
    ]);
    const [g] = aggregatePeriodsPerPlayer(rows);
    expect(g.nPlayers).toBe(3);
    expect(g.perPlayer.player_load).toBe(120); // (100+140+120)/3
    expect(g.perPlayer.distance_m).toBe(900);
  });
});

describe("matchPeriodsToItems", () => {
  const groups = aggregatePeriodsPerPlayer(
    csvRowsToPeriodRows([
      row("Warm-up", "A", 80, 700),
      row("Rondo", "A", 120, 900),
      row("SSG 10v10", "A", 200, 1800),
    ]),
  );

  it("matches by name regardless of order/case/punctuation", () => {
    const items: SessionItem[] = [
      { drill_id: "d1", drill_name: "SSG 10v10", sets: 1 },
      { drill_id: "d2", drill_name: "warm up", sets: 1 }, // punctuation/case differs
      { drill_id: "d3", drill_name: "Rondo", sets: 1 },
    ];
    const { items: out, matchedCount, unmatchedPeriods } = matchPeriodsToItems(items, groups);
    expect(matchedCount).toBe(3);
    expect(unmatchedPeriods).toHaveLength(0);
    expect(out[0].actual?.period_name).toBe("SSG 10v10");
    expect(out[0].actual?.matched_by).toBe("name");
    expect(out[1].actual?.period_name).toBe("Warm-up");
    expect(out[2].actual?.player_load).toBe(120);
  });

  it("falls back to order when names differ", () => {
    const items: SessionItem[] = [
      { drill_id: "d1", drill_name: "Activation", sets: 1 },
      { drill_id: "d2", drill_name: "Possession box", sets: 1 },
      { drill_id: "d3", drill_name: "Big game", sets: 1 },
    ];
    const { items: out, matchedCount } = matchPeriodsToItems(items, groups);
    expect(matchedCount).toBe(3);
    // Order fallback zips by first-appearance: Warm-up, Rondo, SSG 10v10
    expect(out[0].actual?.period_name).toBe("Warm-up");
    expect(out[0].actual?.matched_by).toBe("order");
    expect(out[2].actual?.period_name).toBe("SSG 10v10");
  });

  it("surfaces unmatched periods when there are fewer drills", () => {
    const items: SessionItem[] = [{ drill_id: "d1", drill_name: "Rondo", sets: 1 }];
    const { matchedCount, unmatchedPeriods } = matchPeriodsToItems(items, groups);
    expect(matchedCount).toBe(1);
    expect(unmatchedPeriods.map((g) => g.periodName).sort()).toEqual(["SSG 10v10", "Warm-up"]);
  });

  it("is idempotent (re-running yields the same actuals)", () => {
    const items: SessionItem[] = [{ drill_id: "d1", drill_name: "Rondo", sets: 1 }];
    const once = matchPeriodsToItems(items, groups).items;
    const twice = matchPeriodsToItems(once, groups).items;
    expect(twice[0].actual).toEqual(once[0].actual);
  });
});

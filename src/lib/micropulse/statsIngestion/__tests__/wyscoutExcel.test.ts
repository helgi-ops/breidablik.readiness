import { describe, it, expect } from "vitest";
import { parseWyscoutPlayerList, parseWyscoutMatchReport, type WyscoutRow } from "../wyscoutExcel";

// A row keyed by the REAL 115-col headers (subset — the parser is header-name
// driven, so extra/missing columns don't matter).
function seniorRow(over: Partial<Record<string, unknown>> = {}): WyscoutRow {
  return {
    Player: "A. Bjarnason",
    Team: "Breidablik",
    Position: "RB",
    Age: 24,
    "Minutes played": 1980,
    Goals: 3,
    xG: 2.7,
    Assists: 5,
    Shots: 20,
    "Shots on target, %": 45,
    "Accurate passes, %": 86.5,
    "Passes per 90": 41.2,
    "Key passes per 90": 0.8,
    "Duels won, %": 55,
    ...over,
  };
}

const OPTS = { teamId: "team-1", season: "2026", sourceRef: "Search results (1).xlsx" };

describe("parseWyscoutPlayerList", () => {
  it("promotes core columns and carries the long tail into metrics", () => {
    const { stats } = parseWyscoutPlayerList([seniorRow()], OPTS);
    expect(stats).toHaveLength(1);
    const s = stats[0];
    expect(s.minutes).toBe(1980);
    expect(s.goals).toBe(3);
    expect(s.assists).toBe(5);
    expect(s.xg).toBeCloseTo(2.7, 5);
    expect(s.shots).toBe(20);
    expect(s.passAccuracyPct).toBeCloseTo(86.5, 5);
    // per-90 stays in metrics, keyed by exact header; totals stay null
    expect(s.passes).toBeNull();
    expect(s.keyPasses).toBeNull();
    expect(s.metrics["Passes per 90"]).toBeCloseTo(41.2, 5);
    expect(s.metrics["Duels won, %"]).toBe(55);
    expect(s.metrics["Position"]).toBe("RB");
    // rating/duels_won absent from this export
    expect(s.rating).toBeNull();
    expect(s.duelsWon).toBeNull();
  });

  it("derives shots_on_target = round(Shots × SoT% / 100)", () => {
    const { stats } = parseWyscoutPlayerList([seniorRow()], OPTS);
    expect(stats[0].shotsOnTarget).toBe(9); // round(20 × 45 / 100)
  });

  it("does not duplicate promoted headers into metrics, but keeps SoT%", () => {
    const { stats } = parseWyscoutPlayerList([seniorRow()], OPTS);
    const m = stats[0].metrics;
    expect(m["Minutes played"]).toBeUndefined();
    expect(m["Goals"]).toBeUndefined();
    expect(m["Accurate passes, %"]).toBeUndefined();
    expect(m["Player"]).toBeUndefined();
    expect(m["Team"]).toBeUndefined();
    expect(m["Shots on target, %"]).toBe(45); // used to derive but still kept
  });

  it("filters out youth rows (Team != Breidablik) into skipped, never dropped silently", () => {
    const rows = [
      seniorRow(),
      seniorRow({ Player: "Þ. Andersen Willumsson", Team: "Breidablik U19" }),
      seniorRow({ Player: "B. Freyr Ágústsson", Team: "Breidablik II U19" }),
    ];
    const { stats, skipped } = parseWyscoutPlayerList(rows, OPTS);
    expect(stats).toHaveLength(1);
    expect(skipped.map((s) => s.player)).toContain("Þ. Andersen Willumsson");
    expect(skipped).toHaveLength(2);
  });

  it("sets provenance + a stable per-player ref, playerId null until mapped", () => {
    const { stats } = parseWyscoutPlayerList([seniorRow()], OPTS);
    const s = stats[0];
    expect(s.source).toBe("wyscout_excel");
    expect(s.sourceRef).toBe("Search results (1).xlsx");
    expect(s.sourcePlayerRef).toBe("a.bjarnason");
    expect(s.wyscoutPlayerName).toBe("A. Bjarnason");
    expect(s.playerId).toBeNull();
    expect(s.season).toBe("2026");
  });

  it("is tolerant of European decimal commas and % suffixes", () => {
    const { stats } = parseWyscoutPlayerList([seniorRow({ xG: "2,7", "Accurate passes, %": "86,5%" })], OPTS);
    expect(stats[0].xg).toBeCloseTo(2.7, 5);
    expect(stats[0].passAccuracyPct).toBeCloseTo(86.5, 5);
  });

  it("skips blank/total rows with no Player", () => {
    const { stats } = parseWyscoutPlayerList([{ Team: "Breidablik", Goals: 99 } as WyscoutRow], OPTS);
    expect(stats).toHaveLength(0);
  });
});

describe("parseWyscoutMatchReport (per-match) — reuses the season field logic", () => {
  const MOPTS = { teamId: "team-1", matchDate: "2026-05-12", opponent: "Valur", homeAway: "home" as const, sourceRef: "match.xlsx" };

  it("emits PlayerMatchStat with match context + the same promoted core", () => {
    const { stats } = parseWyscoutMatchReport([seniorRow()], MOPTS);
    expect(stats).toHaveLength(1);
    const s = stats[0];
    expect(s.matchDate).toBe("2026-05-12");
    expect(s.opponent).toBe("Valur");
    expect(s.homeAway).toBe("home");
    expect(s.minutes).toBe(1980);
    expect(s.goals).toBe(3);
    expect(s.shotsOnTarget).toBe(9);
    expect(s.metrics["Passes per 90"]).toBeCloseTo(41.2, 5);
    expect(s.source).toBe("wyscout_excel");
    expect(s.sourcePlayerRef).toBe("a.bjarnason");
    expect(s.playerId).toBeNull();
  });

  it("filters youth rows the same way", () => {
    const { stats, skipped } = parseWyscoutMatchReport(
      [seniorRow(), seniorRow({ Player: "X. Youth", Team: "Breidablik U19" })],
      MOPTS,
    );
    expect(stats).toHaveLength(1);
    expect(skipped).toHaveLength(1);
  });
});

import { describe, it, expect } from "vitest";
import { extractMatchId, fibaDataUrl, parseFibaGame, foldShot, playerTendencies } from "../fibaLiveStats";

const feed = {
  period: 4,
  tm: {
    "1": { no: 1, name: "Njardvik", code: "NJA" },
    "2": { no: 2, name: "Haukar", code: "HAU" },
  },
  shot: [
    { tno: 1, p: 4, pno: 401, player: "D. Rodriguez", shirtNumber: "4", x: 8, y: 50, r: 1, actionType: "2pt", subType: "layup", per: 1, actionNumber: 10 },
    { tno: 1, p: 4, pno: 401, player: "D. Rodriguez", shirtNumber: "4", x: 85, y: 20, r: 0, actionType: "3pt", subType: "jumpshot", per: 2, actionNumber: 55 },
    { tno: 1, p: 12, pno: 412, player: "B. Dinkins", shirtNumber: "12", x: 30, y: 70, r: 1, actionType: "2pt", subType: "jumpshot", per: 1, actionNumber: 20 },
    { tno: 2, p: 7, pno: 207, player: "A. Opp", shirtNumber: "7", x: 90, y: 50, r: 1, actionType: "3pt", subType: "jumpshot", per: 3, actionNumber: 30 },
    { tno: 2, p: 7, pno: 207, player: "A. Opp", shirtNumber: "7", x: 88, y: 55, r: 0, actionType: "3pt", subType: "jumpshot", per: 3, actionNumber: 31 },
  ],
};

describe("extractMatchId", () => {
  it("pulls the id from a pbp URL and a bare id", () => {
    expect(extractMatchId("https://fibalivestats.dcd.shared.geniussports.com/u/KKI/2846798/pbp.html")).toBe("2846798");
    expect(extractMatchId("2846798")).toBe("2846798");
    expect(extractMatchId("not a url")).toBeNull();
  });
  it("builds the data.json url", () => {
    expect(fibaDataUrl("2846798")).toBe("https://fibalivestats.dcd.shared.geniussports.com/data/2846798/data.json");
  });
});

describe("parseFibaGame", () => {
  it("parses teams and shots", () => {
    const g = parseFibaGame(feed);
    expect(g.teams.map((t) => t.name)).toEqual(["Njardvik", "Haukar"]);
    expect(g.shots).toHaveLength(5);
    const first = g.shots[0];
    expect(first.tno).toBe(1);
    expect(first.playerName).toBe("D. Rodriguez");
    expect(first.result).toBe(1);
    expect(first.actionType).toBe("2pt");
    expect(first.x).toBe(8);
  });
  it("is defensive on junk", () => {
    expect(parseFibaGame(null).shots).toEqual([]);
    expect(parseFibaGame({ tm: {}, shot: "nope" }).teams).toEqual([]);
  });

  it("reads shots from tm[k].shot (the REAL feed shape), not just a top-level shot array", () => {
    const real = {
      tm: {
        "1": { no: 1, name: "Grindavik", shot: [
          { r: 1, x: 5.5, y: 57.8, p: 13, pno: 13, tno: 1, per: 1, actionType: "2pt", subType: "reverselayup", player: "J. Semple", shirtNumber: "45", actionNumber: 14 },
          { r: 0, x: 92, y: 30, p: 2, pno: 2, tno: 1, per: 3, actionType: "3pt", subType: "pullupjumpshot", player: "J. Pargo", shirtNumber: "2", actionNumber: 400 },
        ] },
        "2": { no: 2, name: "Tindastoll", shot: [
          { r: 1, x: 6, y: 50, p: 8, pno: 8, tno: 2, per: 2, actionType: "2pt", subType: "dunk", player: "D. Basile", shirtNumber: "1", actionNumber: 200 },
        ] },
      },
    };
    const g = parseFibaGame(real);
    expect(g.shots).toHaveLength(3);
    expect(g.shots.filter((s) => s.tno === 1)).toHaveLength(2);
    expect(g.shots.find((s) => s.playerName === "J. Semple" && s.subType === "reverselayup")).toBeTruthy();
    // far-half shot (x=92) folds onto the near half
    expect(foldShot(92, 30)).toEqual({ x: 8, y: 70 });
  });
});

describe("parseFibaGame pbp", () => {
  it("links assists (previousAction → made shot) and tallies shot context qualifiers", () => {
    const withPbp = {
      tm: { "1": { no: 1, name: "Njardvik", shot: [] }, "2": { no: 2, name: "Haukar", shot: [] } },
      pbp: [
        { tno: 1, actionType: "3pt", success: 1, actionNumber: 671, player: "B. Dinkins", qualifier: [] },
        { tno: 1, actionType: "assist", success: 1, actionNumber: 672, previousAction: 671, player: "D. Rodriguez" },
        { tno: 1, actionType: "2pt", success: 1, actionNumber: 680, player: "P. Hersler", qualifier: ["pointsinthepaint", "fromturnover"] },
        { tno: 1, actionType: "assist", success: 1, actionNumber: 681, previousAction: 680, player: "D. Rodriguez" },
        { tno: 2, actionType: "2pt", success: 1, actionNumber: 700, player: "X. Opp", qualifier: ["fastbreak"] },
      ],
    };
    const g = parseFibaGame(withPbp);
    const nj = g.pbp[1];
    // D. Rodriguez assisted 2 made shots (one a three)
    const rod = nj.assists.find((a) => a.passer === "D. Rodriguez" && a.scorer === "B. Dinkins");
    expect(rod?.count).toBe(1);
    expect(rod?.threes).toBe(1);
    expect(nj.assists.find((a) => a.scorer === "P. Hersler")?.count).toBe(1);
    // context: 2 made FG, 1 in paint, 1 off TO
    expect(nj.context.totalMade).toBe(2);
    expect(nj.context.paint).toBe(1);
    expect(nj.context.offTurnover).toBe(1);
    expect(g.pbp[2].context.fastbreak).toBe(1);
  });
});

describe("foldShot", () => {
  it("mirrors the far half onto the near half", () => {
    expect(foldShot(8, 50)).toEqual({ x: 8, y: 50 });          // already near half
    expect(foldShot(85, 20)).toEqual({ x: 15, y: 80 });        // far half → mirrored
  });
});

describe("playerTendencies", () => {
  it("aggregates FG / 2pt / 3pt splits per player, by attempts desc", () => {
    const g = parseFibaGame(feed);
    const own = playerTendencies(g.shots.filter((s) => s.tno === 1));
    const rod = own.find((p) => p.name === "D. Rodriguez")!;
    expect(rod.fga).toBe(2);
    expect(rod.fgm).toBe(1);
    expect(rod.twoA).toBe(1); expect(rod.twoM).toBe(1); expect(rod.twoPct).toBe(100);
    expect(rod.tpa).toBe(1); expect(rod.tpm).toBe(0); expect(rod.tpPct).toBe(0);
    // layup + jumpshot recorded as separate types
    expect(rod.byType.map((t) => t.type).sort()).toEqual(["jumpshot", "layup"]);

    const opp = playerTendencies(g.shots.filter((s) => s.tno === 2));
    const o = opp[0];
    expect(o.tpa).toBe(2); expect(o.tpm).toBe(1); expect(o.tpPct).toBe(50);
  });
});

describe("analyzeScoringRuns", () => {
  // Chronological events → the feed lists them newest-first, so reverse into the fixture.
  const chrono = [
    { period: 1, gt: "9:40", tno: 2, actionType: "turnover", s1: 0, s2: 0 },              // opp gives it up
    { period: 1, gt: "9:35", tno: 1, actionType: "steal", s1: 0, s2: 0 },
    { period: 1, gt: "9:30", tno: 1, actionType: "2pt", success: 1, qualifier: ["fastbreak", "fromturnover", "pointsinthepaint"], s1: 2, s2: 0 },
    { period: 1, gt: "9:10", tno: 2, actionType: "3pt", success: 0, s1: 2, s2: 0 },        // opp brick
    { period: 1, gt: "8:55", tno: 1, actionType: "3pt", success: 1, qualifier: [], s1: 5, s2: 0 },
    { period: 1, gt: "8:55", tno: 1, actionType: "assist", previousAction: 0, s1: 5, s2: 0 },
    { period: 1, gt: "8:30", tno: 2, actionType: "turnover", s1: 5, s2: 0 },               // opp gives it up again
    { period: 1, gt: "8:20", tno: 1, actionType: "2pt", success: 1, qualifier: ["pointsinthepaint", "fromturnover"], s1: 7, s2: 0 },
    { period: 1, gt: "8:10", tno: 2, actionType: "timeout", s1: 7, s2: 0 },                // opp stops the run
    { period: 1, gt: "7:50", tno: 2, actionType: "2pt", success: 1, s1: 7, s2: 2 },        // opp finally scores → run ends
  ];
  const feedRuns = { period: 4, tm: { "1": { name: "A" }, "2": { name: "B" } }, pbp: [...chrono].reverse() };

  it("detects a 7-0 run for team 1 (only) and none for team 2", () => {
    const a = parseFibaGame(feedRuns).runs;
    expect(a.threshold).toBe(6);
    expect(a.runs).toHaveLength(1);
    expect(a.runs[0].team).toBe(1);
    expect(a.runs[0].points).toBe(7);
    expect(a.recipe[1].runs).toBe(1);
    expect(a.recipe[2].runs).toBe(0);
  });

  it("captures the anatomy of the run — how it was built and what the opponent gave up", () => {
    const r = parseFibaGame(feedRuns).runs.runs[0];
    expect(r.made2).toBe(2);
    expect(r.made3).toBe(1);
    expect(r.paint).toBe(2);
    expect(r.fastbreak).toBe(1);
    expect(r.offTurnover).toBe(2);
    expect(r.assisted).toBe(1);
    expect(r.steals).toBe(1);
    // the drought window includes the opponent's misses, turnovers and the stopping timeout
    expect(r.oppTurnovers).toBe(2);
    expect(r.oppMissed).toBe(1);
    expect(r.oppTimeout).toBe(true);
    expect(r.startClock).toBe("9:30");
    expect(r.scoreHome).toBe(7);
  });

  it("computes the recipe as shares of run baskets", () => {
    const rec = parseFibaGame(feedRuns).runs.recipe[1];
    expect(rec.madeFG).toBe(3);
    expect(rec.paintPct).toBeCloseTo(66.7, 0);   // 2 of 3
    expect(rec.threePct).toBeCloseTo(33.3, 0);   // 1 of 3
    expect(rec.offTurnoverPct).toBeCloseTo(66.7, 0);
    expect(rec.biggestRun).toBe(7);
    expect(rec.oppTurnovers).toBe(2);
  });

  it("returns empty when there is no play-by-play", () => {
    const a = parseFibaGame({ tm: { "1": { name: "A" }, "2": { name: "B" } } }).runs;
    expect(a.runs).toHaveLength(0);
    expect(a.recipe[1].runs).toBe(0);
    expect(a.recipe[2].runs).toBe(0);
  });
});

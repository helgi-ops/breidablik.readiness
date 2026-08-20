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
    expect(g.shots.find((s) => s.player = "J. Semple" && s.subType === "reverselayup")).toBeTruthy();
    // far-half shot (x=92) folds onto the near half
    expect(foldShot(92, 30)).toEqual({ x: 8, y: 70 });
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

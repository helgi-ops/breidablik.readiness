import { describe, it, expect } from "vitest";
import { aggregateSeasonStats, statNumber } from "../instatStatGroups";

describe("statNumber", () => {
  it("parses numbers, percentages and blanks", () => {
    expect(statNumber(12)).toBe(12);
    expect(statNumber("45.5")).toBe(45.5);
    expect(statNumber("45.5%")).toBe(45.5);
    expect(statNumber("-")).toBeNull();
    expect(statNumber("")).toBeNull();
    expect(statNumber(null)).toBeNull();
    expect(statNumber("x")).toBeNull();
  });
});

describe("aggregateSeasonStats", () => {
  it("averages each column over the games that reported it, per folded name", () => {
    const rows = [
      { name: "B. Dinkins", stats: { "Drives": 10, "Usage Percentage": "30", "Deflections": "-" } },
      { name: "B. Dinkins", stats: { "Drives": 6, "Usage Percentage": "20", "Deflections": 4 } },
      { name: "Á. Grímsdóttir", stats: { "Drives": 2 } },
    ];
    const out = aggregateSeasonStats(rows);
    const bd = out.find((p) => p.name === "B. Dinkins")!;
    expect(bd.games).toBe(2);
    expect(bd.stats["Drives"]).toBe(8);             // (10+6)/2
    expect(bd.stats["Usage Percentage"]).toBe(25);  // (30+20)/2
    expect(bd.stats["Deflections"]).toBe(4);        // only 1 game reported it → mean of that game
    // sorted by games desc → Dinkins (2) before Grímsdóttir (1)
    expect(out[0].name).toBe("B. Dinkins");
  });

  it("folds accents/case so the same player merges across spellings", () => {
    const out = aggregateSeasonStats([
      { name: "Ásta Grimsdottir", stats: { "Drives": 4 } },
      { name: "ásta grímsdóttir", stats: { "Drives": 6 } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].games).toBe(2);
    expect(out[0].stats["Drives"]).toBe(5);
  });
});

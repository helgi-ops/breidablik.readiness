import { describe, it, expect } from "vitest";
import { groupOf, groupStats, statValue, labelFor } from "../instatStatGroups";

describe("instatStatGroups", () => {
  it("routes columns to the right group", () => {
    expect(groupOf("Opp Transition shots made")).toBe("defense");
    expect(groupOf("Opponent's field goals, %")).toBe("defense");
    expect(groupOf("Contested field goals, %")).toBe("shotQuality");
    expect(groupOf("Uncontested field goals made")).toBe("shotQuality");
    expect(groupOf("PnR Handlers made")).toBe("playtypes");
    expect(groupOf("Right drives made, %")).toBe("playtypes");
    expect(groupOf("Catch and shoot made")).toBe("playtypes");
    expect(groupOf("Post up, %")).toBe("playtypes");
    expect(groupOf("True shooting percentage")).toBe("advanced");
    expect(groupOf("Usage Percentage")).toBe("advanced");
    expect(groupOf("Deflections")).toBe("advanced");
    expect(groupOf("Some Unknown Metric")).toBe("other");
  });

  it("normalises empty cells", () => {
    expect(statValue("-")).toBe("–");
    expect(statValue("")).toBe("–");
    expect(statValue(null)).toBe("–");
    expect(statValue("56%")).toBe("56%");
    expect(statValue(14)).toBe("14");
  });

  it("groups a real-shaped row, skipping identity/core and empty cells", () => {
    const row = {
      Player: "Brittanny Dinkins", "Jersey number": "12", Minutes: "39:52",
      Points: 36, "Field goals made": 14, // core/identity → skipped
      "Usage Percentage": "38.5%", "True shooting percentage": "63.1%",
      "PnR Handlers made": 4, "PnR Handlers attempted": 6,
      "Contested field goals, %": "50%",
      "Opp Transition shots made": "-",   // empty → hidden
      "Opp Drives shots made, %": "33.3%",
      Deflections: "-",                    // empty → hidden
    };
    const groups = groupStats(row);
    const byKey = Object.fromEntries(groups.map((g) => [g.group, g.rows]));
    expect(byKey.playtypes?.map((r) => r.key)).toEqual(expect.arrayContaining(["PnR Handlers made", "PnR Handlers attempted"]));
    expect(byKey.advanced?.map((r) => r.key)).toEqual(expect.arrayContaining(["Usage Percentage", "True shooting percentage"]));
    expect(byKey.shotQuality?.map((r) => r.key)).toContain("Contested field goals, %");
    expect(byKey.defense?.map((r) => r.key)).toContain("Opp Drives shots made, %");
    // skipped/empty are absent
    const allKeys = groups.flatMap((g) => g.rows.map((r) => r.key));
    expect(allKeys).not.toContain("Points");
    expect(allKeys).not.toContain("Opp Transition shots made");
    expect(allKeys).not.toContain("Deflections");
  });

  it("labels fall back to the InStat name", () => {
    expect(labelFor("PnR Handlers made", "EN")).toBe("PnR Handlers made");
    expect(labelFor("Usage Percentage", "IS")).toBe("Notkunarhlutfall (usage)");
    expect(labelFor("PnR Handlers made", "IS")).toBe("PnR Handlers made");
  });
});

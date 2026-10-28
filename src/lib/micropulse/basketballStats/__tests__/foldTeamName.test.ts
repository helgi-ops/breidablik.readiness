import { describe, it, expect } from "vitest";
import { foldTeamName } from "../fibaGamesRead";

describe("foldTeamName", () => {
  it("collapses the InStat '<Club> Reykjavik' variant onto the KKÍ short name", () => {
    expect(foldTeamName("KR Reykjavik")).toBe("kr");
    expect(foldTeamName("KR")).toBe("kr");
    expect(foldTeamName("KR Reykjavik")).toBe(foldTeamName("KR"));
    expect(foldTeamName("Valur Reykjavík")).toBe("valur");
  });

  it("does NOT strip '…vik' from clubs that merely end in it", () => {
    expect(foldTeamName("Keflavik")).toBe("keflavik");
    expect(foldTeamName("Njardvik")).toBe("njardvik");
    expect(foldTeamName("Grindavik")).toBe("grindavik");
  });

  it("is accent-, case- and punctuation-insensitive", () => {
    expect(foldTeamName("Fjölnir")).toBe("fjolnir");
    expect(foldTeamName("  fjolnir ")).toBe("fjolnir");
    expect(foldTeamName(null)).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import { parseStatsbombScoutPlayers, isStatsbombScoutPlayerHeader } from "../statsbombScoutPlayers";

describe("StatsBomb scout-player export (Name/Team/per-90)", () => {
  const header = ["Name", "Team", "Minutes", "Goals & Pen Goals", "Non Penalty xG", "Assists", "xG Assisted"];
  it("detects the header (Name+Team, not a Squad file)", () => {
    expect(isStatsbombScoutPlayerHeader(header)).toBe(true);
    expect(isStatsbombScoutPlayerHeader(["Player", "Non Penalty xG"])).toBe(false); // Squad file
    expect(isStatsbombScoutPlayerHeader(["Team Name", "Non Penalty xG"])).toBe(false); // Team Stats
  });

  it("converts per-90 rates to season totals and keeps only the wanted team", () => {
    const rows = [
      { Name: "Aron Sigurðarson", Team: "KR Reykjavík", Minutes: "1484", "Goals & Pen Goals": "0.97", "Non Penalty xG": "0.45", Assists: "0.42", "xG Assisted": "0.42" },
      { Name: "Other Guy", Team: "Valur", Minutes: "900", "Goals & Pen Goals": "1.0", "Non Penalty xG": "0.5", Assists: "0", "xG Assisted": "0.1" },
    ];
    const p = parseStatsbombScoutPlayers(rows, { teamName: "KR Reykjavík" });
    expect(p.length).toBe(1); // Valur player filtered out
    expect(p[0].player_name).toBe("Aron Sigurðarson");
    expect(p[0].goals).toBe(16);            // 0.97 × 1484 / 90 ≈ 16 (whole count)
    expect(p[0].xg).toBeCloseTo(7.42, 1);   // continuous
    expect(p[0].position).toBeNull();       // StatsBomb Player Stats has no position column
  });

  it("keeps a single-team file whole even when the typed name is shorter (KR vs KR Reykjavík)", () => {
    const rows = [
      { Name: "A", Team: "KR Reykjavík", Minutes: "900", "Non Penalty xG": "0.5" },
      { Name: "B", Team: "KR Reykjavík", Minutes: "900", "Non Penalty xG": "0.3" },
    ];
    // typed "KR" must NOT drop "KR Reykjavík" players.
    expect(parseStatsbombScoutPlayers(rows, { teamName: "KR" }).length).toBe(2);
  });

  it("treats N/A and blanks as null", () => {
    const p = parseStatsbombScoutPlayers([{ Name: "X", Team: "KR", Minutes: "N/A", "Non Penalty xG": "" }]);
    expect(p[0].minutes).toBeNull();
    expect(p[0].xg).toBeNull();
  });
});

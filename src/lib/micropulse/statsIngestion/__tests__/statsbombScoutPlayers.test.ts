import { describe, it, expect } from "vitest";
import { parseStatsbombScoutPlayers, isStatsbombScoutPlayerHeader } from "../statsbombScoutPlayers";
import { readMetricBag, buildPlayerAnalysis, type PlayerRow } from "../../playerAnalysis";

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

  it("keeps the full per-90 bag ONLY for the rich Player Stats export (OBV present)", () => {
    const thin = parseStatsbombScoutPlayers([{ Name: "A", Team: "KR", Minutes: "900", "Non Penalty xG": "0.3" }]);
    expect(thin[0].metrics).toBeNull(); // no OBV → thin → honest empty state

    const rich = parseStatsbombScoutPlayers([{ Name: "B", Team: "KR", Minutes: "900", "Non Penalty xG": "0.3", OBV: "0.22", "Deep Progressions": "5.4", "Non Penalty Shots": "2.1", "Touches In Box": "6.0" }]);
    expect(rich[0].metrics).not.toBeNull();
    expect(rich[0].metrics!["OBV"]).toBe(0.22);
  });

  it("readMetricBag resolves canonical keys tolerantly (case-insensitive + aliases)", () => {
    // Player Stats naming: 'Non Penalty Shots' (alias of 'Shots') and 'Touches In Box' (cased).
    const bag = readMetricBag({ "Non Penalty xG": 0.3, "Non Penalty Shots": 2.1, "Touches In Box": 6.0, "OBV": 0.22 });
    expect(bag["Non Penalty xG"]).toBe(0.3);
    expect(bag["Shots"]).toBe(2.1);          // aliased
    expect(bag["Touches in box"]).toBe(6.0); // case-insensitive
    expect(bag["OBV"]).toBe(0.22);
  });

  it("end-to-end: a rich Player Stats squad drives buildPlayerAnalysis role/percentiles", () => {
    const rows = [
      { Name: "Striker", Team: "KR", Minutes: "1000", "Non Penalty xG": "0.55", "Non Penalty Shots": "3.0", "Touches In Box": "8.0", OBV: "0.30", "Deep Progressions": "1.5", "Pressures": "16", "Tackles": "0.6", "Interceptions": "0.2", "Ball Recoveries": "3", "Passing%": "72" },
      { Name: "Anchor", Team: "KR", Minutes: "1000", "Non Penalty xG": "0.04", "Non Penalty Shots": "0.3", "Touches In Box": "0.6", OBV: "0.10", "Deep Progressions": "5.2", "Pressures": "6", "Tackles": "2.1", "Interceptions": "1.3", "Ball Recoveries": "6", "Passing%": "88" },
    ];
    const parsed = parseStatsbombScoutPlayers(rows, { teamName: "KR" });
    const squad: PlayerRow[] = parsed.map((p) => ({ name: p.player_name, minutes: p.minutes, goals: p.goals, assists: p.assists, xg: p.xg, metrics: readMetricBag(p.metrics) }));
    const striker = buildPlayerAnalysis({ player: "Striker", squad })!;
    expect(striker.metrics.find((m) => m.key === "Non Penalty xG")!.percentile).toBe(100);
    expect(striker.metrics.find((m) => m.key === "Shots")!.percentile).toBe(100); // resolved via alias
    expect(striker.role).toBe("attacking");
  });
});

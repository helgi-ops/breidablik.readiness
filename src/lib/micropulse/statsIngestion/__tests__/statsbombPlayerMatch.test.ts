import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseStatsbombPlayerMatch, isStatsbombPlayerMatchHeader } from "../statsbombPlayerMatch";

function toObjects(csv: string): Record<string, unknown>[] {
  const text = csv.replace(/﻿/g, "");
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter((r) => r.some((x) => x.trim() !== ""));
  const header = clean[0];
  return clean.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const fixture = path.join(process.cwd(), "docs/samples/statsbomb/Player-MatchStats-2026.csv");
const hasFixture = fs.existsSync(fixture);

describe.skipIf(!hasFixture)("parseStatsbombPlayerMatch (real IQ player-match export)", () => {
  const objs = toObjects(fs.readFileSync(fixture, "utf-8"));
  const { stats } = parseStatsbombPlayerMatch(objs, { teamId: "t", playerName: "Test Player", sourcePlayerRef: "sbpm:p1", sourceRef: "pm.csv" });

  it("detects a player-match header (no Player/Team-Name column)", () => {
    expect(isStatsbombPlayerMatchHeader(Object.keys(objs[0]))).toBe(true);
  });

  it("emits one PlayerMatchStat per match with inferred opponent + home/away", () => {
    expect(stats.length).toBe(16);
    const m = stats.find((s) => s.matchDate === "2026-08-04")!; // Thor Akureyri vs. Breidablik
    expect(m.opponent).toBe("Thor Akureyri");
    expect(m.homeAway).toBe("away");
    expect(m.source).toBe("statsbomb_csv");
    expect(m.sourcePlayerRef).toBe("sbpm:p1");
    expect(m.wyscoutPlayerName).toBe("Test Player");
    expect(m.passes).toBe(41);   // per-match total, not per-90
    expect(m.metrics).toHaveProperty("OBV");
  });
});

describe("parseStatsbombPlayerMatch (synthetic, always-on)", () => {
  const rows = [
    { "Match": "Breidablik vs. Valur", "Date": "2026-05-01", "Minutes": "90", "Goals & Penalty Goals": "1", "Assists": "0", "Non Penalty xG": "0.5", "Shots": "3", "Passes": "50", "Key Passes": "2", "OBV": "0.4", "Line Breaking Passes": "" },
    { "Match": "KR vs. Breidablik", "Date": "2026-05-08", "Minutes": "72", "Goals & Penalty Goals": "0", "Assists": "1", "Non Penalty xG": "0.1", "Shots": "1", "Passes": "30", "Key Passes": "1", "OBV": "0.2", "Line Breaking Passes": "" },
  ];
  it("does NOT treat a per-match TEAM Match Stats header as a player file", () => {
    // Team Match Stats shares Match+Date+OBV and has no Player column — the tell is
    // the team-only opposition markers. Regression guard against writing a team's
    // per-match totals as one player's stats.
    const teamHeader = ["Match", "Date", "Minutes", "Goals", "OBV", "Passes", "Opposition Passes", "Opposition xG", "Non Penalty Shots Faced"];
    expect(isStatsbombPlayerMatchHeader(teamHeader)).toBe(false);
    // A genuine player-match header (no team-only markers) still detects true.
    const playerHeader = ["Match", "Date", "Minutes", "Goals & Penalty Goals", "OBV", "Passes", "Key Passes"];
    expect(isStatsbombPlayerMatchHeader(playerHeader)).toBe(true);
  });

  it("accepts a GOALKEEPER per-player file (has 'Non Penalty Shots Faced' but no Opposition aggregates)", () => {
    // A keeper faces shots, so his file carries "Non Penalty Shots Faced" — that must NOT
    // be read as a team-file marker (only Opposition Passes/xG are). Regression: keeper
    // stats were wrongly rejected/redirected to Team Match Insight.
    const gkHeader = ["Match", "Date", "Minutes", "Non Penalty Save%", "Non Penalty Shots Faced", "Saves", "Shots Faced", "Goals Saved Above Average", "Game SBD ID"];
    expect(isStatsbombPlayerMatchHeader(gkHeader)).toBe(true);
  });

  it("parses an Excel date SERIAL (a CSV date often arrives as 46237.99, not a string)", () => {
    const gkRows = [{ "Match": "Thor Akureyri vs. Breidablik", "Date": 46237.9999, "Minutes": "100", "Saves": "2", "Non Penalty Save%": "0.67", "Non Penalty PSxG Faced": "1.47", "Game SBD ID": "4047232" }];
    const { stats, skipped } = parseStatsbombPlayerMatch(gkRows, { teamId: "t", playerName: "Anton Ari Einarsson", sourcePlayerRef: "sbpm:anton", clubName: "Breidablik" });
    expect(skipped.length).toBe(0);
    expect(stats[0].matchDate).toBe("2026-08-04");   // NOT off-by-one
    expect(stats[0].opponent).toBe("Thor Akureyri");
    expect(stats[0].homeAway).toBe("away");
    expect(stats[0].minutes).toBe(100);
    expect(stats[0].metrics["Saves"]).toBe(2);        // GK stats preserved in the bag
    expect(stats[0].metrics["Non Penalty PSxG Faced"]).toBeCloseTo(1.47, 2);
  });

  it("infers club, opponent, home/away and drops empty 360", () => {
    const { stats } = parseStatsbombPlayerMatch(rows, { teamId: "t", playerName: "A. Player", sourcePlayerRef: "sbpm:x", clubName: "Breidablik" });
    expect(stats[0].homeAway).toBe("home");
    expect(stats[0].opponent).toBe("Valur");
    expect(stats[1].homeAway).toBe("away");
    expect(stats[1].opponent).toBe("KR");
    expect(stats[0].goals).toBe(1);
    expect(stats[0].metrics).not.toHaveProperty("Line Breaking Passes");
  });
});

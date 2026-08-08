import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseStatsbombSquad, isStatsbombSquadHeader } from "../statsbombSquad";

// RFC-4180 CSV → header-keyed row objects (mirrors SheetJS sheet_to_json in the route).
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

const fixture = path.join(process.cwd(), "docs/samples/statsbomb/Breidablik-Squad-2026.csv");
const hasFixture = fs.existsSync(fixture);

describe.skipIf(!hasFixture)("parseStatsbombSquad (real IQ squad export)", () => {
  if (!hasFixture) return; // skipIf skips the tests; this stops the eager read below running at collection
  const objs = toObjects(fs.readFileSync(fixture, "utf-8"));
  const { stats } = parseStatsbombSquad(objs, { teamId: "team-uuid", season: "2026", sourceRef: "squad.csv" });

  it("detects the StatsBomb squad header", () => {
    expect(isStatsbombSquadHeader(Object.keys(objs[0]))).toBe(true);
  });

  it("parses the whole squad with stable SBD-id refs", () => {
    expect(stats.length).toBeGreaterThanOrEqual(20);
    expect(stats.every((s) => s.source === "statsbomb_csv")).toBe(true);
    const k = stats.find((s) => s.wyscoutPlayerName === "Kristófer Kristinsson")!;
    expect(k.sourcePlayerRef).toBe("sb:16071");
  });

  it("converts per-90 rate stats to season totals (per90 × minutes/90)", () => {
    const k = stats.find((s) => s.wyscoutPlayerName === "Kristófer Kristinsson")!;
    expect(k.minutes).toBeCloseTo(845, 0);
    expect(k.goals).toBe(9);          // 0.9583/90 × 845 ≈ 9
    expect(k.xg).toBeCloseTo(5.31, 1); // 0.5655 × 845/90
    expect(k.metrics.unit).toBe("per90"); // raw values stay per-90, tagged
  });

  it("keeps OBV etc. and drops the empty 360 columns", () => {
    const k = stats.find((s) => s.wyscoutPlayerName === "Kristófer Kristinsson")!;
    expect(k.metrics).toHaveProperty("OBV");
    expect(Object.keys(k.metrics).some((m) => /Line Breaking Passes|Ball Receipts in Space|Space Received/.test(m))).toBe(false);
  });
});

describe("parseStatsbombSquad (synthetic, always-on)", () => {
  const rows = [
    { "Player": "Jon Jonsson", "Player SBD ID": "999", "Minutes": "900", "Goals & Penalty Goals": "0.5", "Assists": "0.2", "Non Penalty xG": "0.4", "OBV": "0.3", "Line Breaking Passes": "" },
  ];
  it("totals = per90 × minutes/90, tags unit, drops empty 360", () => {
    const { stats } = parseStatsbombSquad(rows, { teamId: "t", season: "2026" });
    const s = stats[0];
    expect(s.minutes).toBe(900);
    expect(s.goals).toBe(5);   // 0.5 × 10
    expect(s.assists).toBe(2); // 0.2 × 10
    expect(s.xg).toBe(4);      // 0.4 × 10
    expect(s.sourcePlayerRef).toBe("sb:999");
    expect(s.metrics.unit).toBe("per90");
    expect(s.metrics).not.toHaveProperty("Line Breaking Passes");
  });
});

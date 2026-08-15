import { describe, it, expect } from "vitest";
import { parseCatapultPeakPeriod, parseWindowMinutes } from "../parseCatapultPeakPeriod";

describe("parseWindowMinutes", () => {
  it("reads mm:ss, N min, and N s", () => {
    expect(parseWindowMinutes("peak player load (1:00)")).toBe(1);
    expect(parseWindowMinutes("peak player load (5:00)")).toBe(5);
    expect(parseWindowMinutes("peak player load (0:30)")).toBe(0.5);
    expect(parseWindowMinutes("player load 3 min peak")).toBe(3);
    expect(parseWindowMinutes("hsr 30 s peak")).toBe(0.5);
  });
  it("returns null with no window token", () => {
    expect(parseWindowMinutes("total player load")).toBeNull();
    // 'm' in 'metabolic' must NOT be read as a minute window.
    expect(parseWindowMinutes("metabolic power average")).toBeNull();
  });
});

describe("parseCatapultPeakPeriod", () => {
  it("pattern-detects peak columns into long-format rows (mm:ss layout)", () => {
    const matrix: string[][] = [
      ["Athlete", "Date", "Peak Player Load (1:00)", "Peak Player Load (5:00)", "Peak Metabolic Power (1:00)"],
      ["Arnór Gauti", "2026-07-20", "24.1", "18.0", "62.5"],
      ["Ágúst Orri", "2026-07-20", "26.3", "19.4", "70.1"],
    ];
    const p = parseCatapultPeakPeriod(matrix);
    expect(p.detectedColumns).toBe(3);
    expect(p.windows).toEqual([1, 5]);
    expect(p.metrics).toEqual(["metabolic_power", "player_load"]);
    expect(p.athletes).toEqual(["Arnór Gauti", "Ágúst Orri"]);
    expect(p.rows).toHaveLength(6); // 2 athletes × 3 columns
    const oneMinPl = p.rows.find((r) => r.athlete === "Ágúst Orri" && r.metric === "player_load" && r.windowMin === 1);
    expect(oneMinPl?.value).toBe(26.3);
    expect(oneMinPl?.date).toBe("2026-07-20");
  });

  it("handles an alternate 'N min' header layout + dd/mm/yyyy dates + units", () => {
    const matrix: string[][] = [
      ["Player Name", "Session Date", "Player Load 1 Min Peak (AU)", "High Speed 3 Min Peak (m)"],
      ["Davíð Ingvarsson", "20/07/2026", "22.0", "410"],
    ];
    const p = parseCatapultPeakPeriod(matrix);
    expect(p.detectedColumns).toBe(2);
    expect(p.metrics).toEqual(["hsr", "player_load"]);
    const hsr = p.rows.find((r) => r.metric === "hsr");
    expect(hsr?.windowMin).toBe(3);
    expect(hsr?.value).toBe(410);
    expect(hsr?.unit).toBe("m");
    expect(hsr?.date).toBe("2026-07-20"); // dd/mm/yyyy → ISO
  });

  it("skips blank values and warns when nothing is recognised", () => {
    const withBlank = parseCatapultPeakPeriod([
      ["Athlete", "Peak Player Load (1:00)"],
      ["A", ""],
      ["B", "12"],
    ]);
    expect(withBlank.rows).toHaveLength(1); // A's blank skipped
    expect(withBlank.rows[0].athlete).toBe("B");

    const nothing = parseCatapultPeakPeriod([
      ["Athlete", "Total Distance", "Total Player Load"],
      ["A", "9000", "600"],
    ]);
    expect(nothing.detectedColumns).toBe(0);
    expect(nothing.rows).toHaveLength(0);
    expect(nothing.warnings.join(" ")).toMatch(/no peak-period columns/i);
  });

  it("warns (not throws) on an empty export", () => {
    expect(parseCatapultPeakPeriod([]).warnings.length).toBeGreaterThan(0);
    expect(parseCatapultPeakPeriod([["Athlete"]]).warnings.length).toBeGreaterThan(0);
  });
});

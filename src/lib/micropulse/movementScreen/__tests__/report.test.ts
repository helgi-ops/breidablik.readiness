import { describe, it, expect } from "vitest";
import { SEED_MOVEMENT_TESTS } from "../registry";
import { interpretScreen, type ScreenFinding } from "../interpret";
import { buildScreenReport } from "../report";

const SLDJ = SEED_MOVEMENT_TESTS.find((t) => t.slug === "single_leg_drop_jump")!;

describe("buildScreenReport", () => {
  it("assembles a layered report: verdict, facts, rows with bands, readings, references", () => {
    const findings: ScreenFinding[] = [
      { variableKey: "knee_valgus_contact", leg: "L", severity: "marked", value: 0.15 },
      { variableKey: "trunk_lean", leg: null, severity: "ok", value: 6 },
    ];
    const ctx = { viewCount: 1, poseQuality: "fair" as const, repeated: false };
    const result = interpretScreen(SLDJ, findings, ctx);
    const report = buildScreenReport(SLDJ, findings, ctx, result);

    expect(report.redFlag).toBe(false);
    expect(report.tone).toBe("alert"); // marked valgus
    expect(report.verdict.en).toMatch(/valgus/i);
    expect(report.facts.length).toBeGreaterThan(0);
    // Rows include both recorded variables, each with its band label + citation.
    const valgusRow = report.rows.find((r) => r.variableKey === "knee_valgus_contact")!;
    expect(valgusRow.severity).toBe("marked");
    expect(valgusRow.bandLabel).not.toBeNull();
    expect(valgusRow.citation).toMatch(/Hewett/);
    // The fired interpretation + the test references are carried through.
    expect(report.readings.length).toBeGreaterThan(0);
    expect(report.references.length).toBeGreaterThan(0);
    // A single screen adds the "repeat turns this into a trend" caveat.
    expect(report.caveats.some((c) => /trend/i.test(c.en))).toBe(true);
  });

  it("a pain / red flag report suppresses interpretation and routes to a clinician", () => {
    const findings: ScreenFinding[] = [{ variableKey: "knee_valgus_contact", leg: "L", severity: "marked" }];
    const ctx = { painReported: true };
    const result = interpretScreen(SLDJ, findings, ctx);
    const report = buildScreenReport(SLDJ, findings, ctx, result);
    expect(report.redFlag).toBe(true);
    expect(report.tone).toBe("alert");
    expect(report.verdict.en).toMatch(/clinician/i);
    expect(report.readings).toHaveLength(0);
  });
});

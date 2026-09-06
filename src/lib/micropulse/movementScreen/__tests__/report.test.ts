import { describe, it, expect } from "vitest";
import { SEED_MOVEMENT_TESTS } from "../registry";
import { interpretScreen, type ScreenFinding } from "../interpret";
import { buildScreenReport } from "../report";

const SLDJ = SEED_MOVEMENT_TESTS.find((t) => t.slug === "single_leg_drop_jump")!;
const OHSA = SEED_MOVEMENT_TESTS.find((t) => t.slug === "overhead_squat_assessment")!;

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

  it("lists EVERY checkpoint by view — measured, coach-scored, or not captured", () => {
    // Only the front knee valgus is scored; everything else is untouched.
    const findings: ScreenFinding[] = [{ variableKey: "knee_valgus", severity: "moderate", value: 0.08 }];
    const ctx = { viewCount: 1, poseQuality: "fair" as const };
    const result = interpretScreen(OHSA, findings, ctx);
    const report = buildScreenReport(OHSA, findings, ctx, result);

    // One checkpoint per test variable (nothing dropped).
    expect(report.checkpoints.length).toBe(OHSA.variables.length);
    // Grouped across all three views.
    const views = new Set(report.checkpoints.map((c) => c.view));
    expect(views.has("front")).toBe(true);
    expect(views.has("side")).toBe(true);
    expect(views.has("back")).toBe(true);
    // The scored pose checkpoint is flagged; a pose one never scored is "not captured".
    const valgus = report.checkpoints.find((c) => c.variableKey === "knee_valgus")!;
    expect(valgus.source).toBe("pose");
    expect(valgus.status).toBe("flagged");
    const pelvic = report.checkpoints.find((c) => c.variableKey === "pelvic_obliquity")!;
    expect(pelvic.source).toBe("pose");
    expect(pelvic.status).toBe("not_captured");
    // A coach-only checkpoint is tagged as coach-scored.
    const armsFwd = report.checkpoints.find((c) => c.variableKey === "arms_fall_forward")!;
    expect(armsFwd.source).toBe("coach");
    expect(armsFwd.status).toBe("not_captured");
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

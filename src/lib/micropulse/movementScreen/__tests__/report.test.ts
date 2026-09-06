import { describe, it, expect } from "vitest";
import { SEED_MOVEMENT_TESTS } from "../registry";
import { interpretScreen, type ScreenFinding } from "../interpret";
import { buildScreenReport } from "../report";

const SLDJ = SEED_MOVEMENT_TESTS.find((t) => t.slug === "single_leg_drop_jump")!;
const OHSA = SEED_MOVEMENT_TESTS.find((t) => t.slug === "overhead_squat_assessment")!;
const HOP = SEED_MOVEMENT_TESTS.find((t) => t.slug === "hop_for_distance")!;

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
    // Honest evidence caveat surfaces: strong screen, weak injury prediction.
    expect(report.caveats.some((c) => /injury[- ]prediction|injury-risk/i.test(c.en))).toBe(true);
    // The MKD reading is grounded + graded strong, with the trainable/re-screen lever.
    const mkd = report.readings.find((r) => r.variableKey === "knee_valgus")!;
    expect(mkd.evidenceGrade).toBe("strong");
    expect(mkd.lever.en).toMatch(/re-screen/i);
  });

  it("carries honest evidence caveats for the drop jump and the hop (screen vs injury prediction)", () => {
    const sldj = buildScreenReport(SLDJ, [{ variableKey: "knee_valgus_contact", leg: "L", severity: "moderate", value: 0.08 }], {}, interpretScreen(SLDJ, [{ variableKey: "knee_valgus_contact", leg: "L", severity: "moderate" }], {}));
    expect(sldj.caveats.some((c) => /injury-risk|injury-prediction/i.test(c.en))).toBe(true);
    expect(sldj.caveats.some((c) => /force plate/i.test(c.en))).toBe(true); // RSI precision caveat

    const hop = buildScreenReport(HOP, [{ variableKey: "lsi", severity: "moderate", value: 87 }], {}, interpretScreen(HOP, [{ variableKey: "lsi", severity: "moderate", value: 87 }], {}));
    expect(hop.caveats.some((c) => /overestimate/i.test(c.en))).toBe(true); // Wellsandt LSI caveat
    expect(hop.references.some((r) => /Wellsandt/i.test(r.label))).toBe(true);
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

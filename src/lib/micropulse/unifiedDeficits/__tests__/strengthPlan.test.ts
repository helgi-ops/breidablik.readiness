import { describe, it, expect } from "vitest";
import { buildStrengthPlan } from "../strengthPlan";
import { reconcile, type DeficitRow } from "../reconcile";
import { imaDeficitsFromTotals } from "../imaSignals";

const row = (p: Partial<DeficitRow> & Pick<DeficitRow, "quality" | "source" | "status">): DeficitRow => ({
  confidence: 0.5, provenance: { en: p.source, is: p.source }, ...p,
});

describe("strength/periodization consumer — buildStrengthPlan", () => {
  it("reactive strength → plyometric emphasis with a VBT velocity-end note", () => {
    const plan = buildStrengthPlan(reconcile([row({ quality: "reactive_strength", source: "vald", status: "confirmed", confidence: 0.9 })]));
    const t = plan.find((x) => x.emphasis === "plyometric")!;
    expect(t).toBeTruthy();
    expect(t.vbtNote.en.toLowerCase()).toContain("velocity");
    expect(t.drivers.some((d) => d.source === "vald")).toBe(true);
  });

  it("limb asymmetry → unilateral; decel mechanics → eccentric", () => {
    const plan = buildStrengthPlan(reconcile([
      row({ quality: "limb_asymmetry", source: "vald", status: "confirmed", confidence: 0.9 }),
      ...imaDeficitsFromTotals({ accel: 90, decel: 20, codLeft: 0, codRight: 0, days: 10, latest: "2026-09-01" }),
    ]));
    expect(plan.map((t) => t.emphasis).sort()).toEqual(["eccentric", "unilateral"]);
  });

  it("corrective-only deficits (mobility/movement-quality) do NOT enter the strength plan", () => {
    const plan = buildStrengthPlan(reconcile([
      row({ quality: "ankle_dorsiflexion_mobility", source: "movement_form", status: "hypothesis", confidence: 0.5 }),
      row({ quality: "landing_valgus", source: "movement_screen", status: "hypothesis", confidence: 0.5 }),
    ]));
    expect(plan).toHaveLength(0);
  });

  it("IMA decel_mechanics feeds the strength plan (eccentric) AND stays traceable to IMA", () => {
    const plan = buildStrengthPlan(reconcile(imaDeficitsFromTotals({ accel: 90, decel: 20, codLeft: 0, codRight: 0, days: 12, latest: "2026-09-01" })));
    const t = plan.find((x) => x.emphasis === "eccentric")!;
    expect(t).toBeTruthy();
    expect(t.drivers.some((d) => d.source === "ima")).toBe(true);
  });

  it("a dismissed deficit does not produce a strength emphasis", () => {
    const plan = buildStrengthPlan(reconcile(
      [row({ quality: "reactive_strength", source: "movement_form", status: "hypothesis", confidence: 0.5 })],
      [{ quality: "reactive_strength", action: "dismiss" }],
    ));
    expect(plan).toHaveLength(0);
  });

  it("higher-confidence emphases rank first", () => {
    const plan = buildStrengthPlan(reconcile([
      row({ quality: "limb_asymmetry", source: "vald", status: "confirmed", confidence: 0.9 }), // high
      row({ quality: "reactive_strength", source: "movement_form", status: "hypothesis", confidence: 0.4 }), // hint
    ]));
    expect(plan[0].emphasis).toBe("unilateral");
  });
});

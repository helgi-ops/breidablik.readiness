import { describe, it, expect } from "vitest";
import { vbtDeficitFromProfile } from "../vbtSignals";
import { reconcile } from "../reconcile";
import { buildStrengthPlan } from "../strengthPlan";

const opts = { exerciseLabel: "Back squat", date: "2026-09-01", n: 4 };

describe("VBT writer — force-velocity gap", () => {
  it("velocity-dominant profile → a force deficit (needs max strength)", () => {
    const d = vbtDeficitFromProfile("velocity_dominant", opts)!;
    expect(d.quality).toBe("force_deficit");
    expect(d.source).toBe("vbt");
    expect(d.status).toBe("confirmed");
  });

  it("strength-dominant profile → a velocity deficit (needs speed-strength)", () => {
    const d = vbtDeficitFromProfile("strength_dominant", opts)!;
    expect(d.quality).toBe("velocity_deficit");
  });

  it("balanced / insufficient → no deficit (honest)", () => {
    expect(vbtDeficitFromProfile("balanced", opts)).toBeNull();
    expect(vbtDeficitFromProfile("insufficient_data", opts)).toBeNull();
  });

  it("force deficit → max_strength emphasis; velocity deficit → plyometric — in the strength plan", () => {
    const force = buildStrengthPlan(reconcile([vbtDeficitFromProfile("velocity_dominant", opts)!]));
    expect(force[0].emphasis).toBe("max_strength");
    expect(force[0].vbtNote.en.toLowerCase()).toContain("force end");

    const vel = buildStrengthPlan(reconcile([vbtDeficitFromProfile("strength_dominant", opts)!]));
    expect(vel[0].emphasis).toBe("plyometric");
  });

  it("VBT force deficit + a screen/form finding coexist as distinct strength targets", () => {
    const plan = buildStrengthPlan(reconcile([
      vbtDeficitFromProfile("velocity_dominant", opts)!,
      { quality: "limb_asymmetry", source: "movement_form", status: "hypothesis", confidence: 0.6, provenance: { en: "form", is: "form" } },
    ]));
    expect(plan.map((t) => t.emphasis).sort()).toEqual(["max_strength", "unilateral"]);
  });
});

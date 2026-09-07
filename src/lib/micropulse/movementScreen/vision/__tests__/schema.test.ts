import { describe, it, expect } from "vitest";
import { normalizeMovementVisionAnalysis } from "../schema";

describe("normalizeMovementVisionAnalysis (defensive normalization)", () => {
  it("keeps only real region keys and field ids that belong to the chosen region", () => {
    const raw = {
      summary: "Forward lean driven by thoracic + ankle.",
      captureQuality: "Two views, fair.",
      region: "thoracic",
      priorityFieldIds: ["thoracic_extension", "overhead_reach_wall", "dynamic_valgus_mkd", "made_up_field"],
      observations: [
        { region: "thoracic", severity: "notable", text: "Arms fall forward at depth." },
        { region: "knee", severity: "mild", text: "Knees track fairly symmetric." },
        { region: "not_a_region", severity: "notable", text: "should be dropped" },
        { region: "hip", severity: "banana", text: "clamped severity" },
      ],
      patterns: ["Overhead reach limited"],
      suggestions: [{ title: "Thoracic extension", detail: "Foam roller extensions.", cite: "Gray Institute" }],
      references: ["Gray Institute — Chain Reaction"],
      redFlags: [],
    };
    const out = normalizeMovementVisionAnalysis(raw);
    // region survives; field ids filtered to that region's fields (knee/made-up dropped).
    expect(out.region).toBe("thoracic");
    expect(out.priorityFieldIds).toEqual(["thoracic_extension", "overhead_reach_wall"]);
    // observation with an unknown region is dropped; bad severity clamped to "mild".
    expect(out.observations.some((o) => o.region === "thoracic")).toBe(true);
    expect(out.observations.some((o) => (o.region as string) === "not_a_region")).toBe(false);
    expect(out.observations.find((o) => o.region === "hip")!.severity).toBe("mild");
  });

  it("returns null region + empty priority ids when the model invents a region", () => {
    const out = normalizeMovementVisionAnalysis({ region: "left_elbow", priorityFieldIds: ["x"] });
    expect(out.region).toBeNull();
    expect(out.priorityFieldIds).toEqual([]);
  });

  it("drops priority field ids that don't belong to the chosen region", () => {
    const out = normalizeMovementVisionAnalysis({ region: "knee", priorityFieldIds: ["dynamic_valgus_mkd", "ankle_dorsiflexion_wb"] });
    expect(out.priorityFieldIds).toEqual(["dynamic_valgus_mkd"]); // ankle field is not a knee field
  });

  it("coerces junk to a safe empty shape", () => {
    const out = normalizeMovementVisionAnalysis(null);
    expect(out.summary).toBe("");
    expect(out.observations).toEqual([]);
    expect(out.region).toBeNull();
    expect(out.suggestions).toEqual([]);
  });
});

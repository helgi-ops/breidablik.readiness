import { describe, it, expect } from "vitest";
import { orthoTestsForCompensations, orthoTestsForRegion, groupOrthoByRegion } from "../correctives/orthopedicTests";
import { prescribeForCompensations } from "../correctives/mapping";
import type { CorrectiveExercise } from "../correctives/registry";

describe("orthopedic test recommender", () => {
  it("screen-driven: a hip-abductor-weakness finding suggests Trendelenburg", () => {
    const tests = orthoTestsForCompensations(["hip_abductor_weakness"]);
    expect(tests.some((t) => t.id === "trendelenburg")).toBe(true);
    expect(tests.every((t) => t.addresses.includes("hip_abductor_weakness"))).toBe(true);
  });

  it("region-driven: naming the ankle returns the ankle-DF & instability tests", () => {
    const tests = orthoTestsForRegion("ankle_foot");
    const ids = tests.map((t) => t.id);
    expect(ids).toContain("knee_to_wall_df");
    expect(ids).toContain("sl_balance_sebt");
    expect(tests.every((t) => t.region === "ankle_foot")).toBe(true);
  });

  it("groups by region for display", () => {
    const groups = groupOrthoByRegion(orthoTestsForCompensations(["dynamic_valgus", "limited_dorsiflexion"]));
    const regions = groups.map((g) => g.region);
    expect(regions).toContain("hip");
    expect(regions).toContain("ankle_foot");
  });
});

describe("custom (DB) exercises route by the compensation key", () => {
  const custom: CorrectiveExercise = {
    slug: "custom_test_ex", name: { en: "Club test ex", is: "Prófæfing" }, cue: { en: "cue", is: "cue" },
    phase: "activate", target: { en: "Gluteus medius", is: "Gluteus medius" }, targetKind: "strengthen",
    dose: { en: "3 × 12", is: "3 × 12" }, frequency: { en: "3×/wk", is: "3×/viku" },
    citation: "Club-added", evidenceGrade: "moderate", source: "custom", addresses: ["hip_abductor_weakness"],
  };

  it("a custom exercise addressing the fired compensation is merged in, tagged custom", () => {
    const p = prescribeForCompensations(["hip_abductor_weakness"], [custom])!;
    const items = p.phases.flatMap((g) => g.items);
    const found = items.find((e) => e.slug === "custom_test_ex");
    expect(found).toBeTruthy();
    expect(found!.source).toBe("custom");
  });

  it("a custom exercise NOT addressing the fired compensation is excluded", () => {
    const p = prescribeForCompensations(["limited_dorsiflexion"], [custom])!;
    expect(p.phases.flatMap((g) => g.items).some((e) => e.slug === "custom_test_ex")).toBe(false);
  });
});

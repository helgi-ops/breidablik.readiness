import { describe, it, expect } from "vitest";
import { orthoTestsForCompensations, orthoTestsForRegion, groupOrthoByRegion, buildAssessmentIdeas, GROIN_SUGGESTION } from "../correctives/orthopedicTests";
import { tendonsForCompensations, tendonsForRegion, TENDON_DOSING } from "../correctives/tendonLoading";
import { rehabProtocolsForCompensations, REHAB_PROTOCOL_SLUGS } from "../correctives/rehabProtocolLinks";
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

describe("clinical assessment ideas (finding → rationale + tests + refer)", () => {
  it("a valgus finding gets a plain rationale and suggested tests", () => {
    const { ideas } = buildAssessmentIdeas(["dynamic_valgus"]);
    expect(ideas).toHaveLength(1);
    const idea = ideas[0];
    expect(idea.rationale.en.length).toBeGreaterThan(20); // MicroPulse-authored explanation
    const testIds = idea.groups.flatMap((g) => g.tests.map((t) => t.id));
    expect(testIds).toContain("trendelenburg");
    expect(testIds).toContain("knee_to_wall_df");
  });

  it("a landing-instability finding flags refer (trauma → ligament screen)", () => {
    const { ideas, anyRefer } = buildAssessmentIdeas(["landing_instability"]);
    expect(ideas[0].refer).toBe(true);
    expect(anyRefer).toBe(true);
  });

  it("a training-quality finding (low reactive strength) does not force a refer", () => {
    const { anyRefer } = buildAssessmentIdeas(["low_reactive_strength"]);
    expect(anyRefer).toBe(false);
  });

  it("the groin/Doha suggestion refers and includes the five-entity differential", () => {
    expect(GROIN_SUGGESTION.refer).toBe(true);
    expect(GROIN_SUGGESTION.testIds).toContain("groin_five_entity_palpation");
  });

  it("unmapped findings produce no idea (no invented suggestions)", () => {
    const { ideas } = buildAssessmentIdeas([]);
    expect(ideas).toHaveLength(0);
  });
});

describe("tendon-adaptation layer (Baar)", () => {
  it("maps landing/reactive findings to the relevant tendons", () => {
    expect(tendonsForCompensations(["poor_absorption"])).toContain("patellar");
    expect(tendonsForCompensations(["limited_dorsiflexion"])).toContain("achilles");
    expect(tendonsForCompensations(["low_reactive_strength"]).sort()).toEqual(["achilles", "patellar"]);
  });

  it("maps a region to its tendons and de-duplicates", () => {
    expect(tendonsForRegion("knee")).toEqual(["patellar"]);
    expect(tendonsForRegion("hip").sort()).toEqual(["adductor", "hamstring"]);
    expect(tendonsForCompensations(["low_reactive_strength", "poor_absorption"]).filter((t) => t === "patellar")).toHaveLength(1);
  });

  it("encodes the signature Baar dosing rule (short & frequent, ~6h apart)", () => {
    expect(TENDON_DOSING.rule.en.toLowerCase()).toMatch(/10.?min/);
    expect(TENDON_DOSING.rule.en).toMatch(/6 hours/);
    expect(TENDON_DOSING.citation).toMatch(/Paxton|Baar/);
  });
});

describe("screen → staged-loading rehab protocol bridge", () => {
  it("routes findings to the matching DB protocol slug", () => {
    expect(rehabProtocolsForCompensations(["poor_absorption"]).map((p) => p.slug)).toContain("jumpers_knee_staged_loading");
    expect(rehabProtocolsForCompensations(["limited_dorsiflexion"]).map((p) => p.slug)).toContain("achilles_tendinopathy_staged_loading");
  });

  it("every suggested slug is in the server existence-check list, with a coach path + why", () => {
    for (const p of rehabProtocolsForCompensations(["poor_absorption", "limited_dorsiflexion"])) {
      expect(REHAB_PROTOCOL_SLUGS).toContain(p.slug);
      expect(p.coachPath.startsWith("/coach/")).toBe(true);
      expect(p.why.en.length).toBeGreaterThan(0);
    }
  });

  it("findings with no tendon protocol (e.g. limb asymmetry alone) suggest nothing", () => {
    expect(rehabProtocolsForCompensations(["limb_asymmetry"])).toHaveLength(0);
    expect(rehabProtocolsForCompensations([])).toHaveLength(0);
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

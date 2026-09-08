import { describe, it, expect } from "vitest";
import { buildDeficitLedger, type FiredObservation } from "../deficitLedger";
import { defaultBattery, operationalFor, TEST_OPERATIONAL } from "../testCatalogue";

describe("operational layer (observation → hypothesis → confirmation)", () => {
  it("every default-battery test has challenges + observations with a deficitKey, domains and confirmations", () => {
    for (const test of defaultBattery()) {
      const op = operationalFor(test.slug);
      expect(op, `${test.slug} needs an operational layer`).toBeTruthy();
      expect(op!.challenges.en.length).toBeGreaterThan(0);
      expect(op!.observations.length).toBeGreaterThan(0);
      for (const ob of op!.observations) {
        expect(ob.deficitKey, `${test.slug}/${ob.key}`).toBeTruthy();
        expect(ob.domains.length).toBeGreaterThan(0);
        expect(ob.confirmationTests.length).toBeGreaterThan(0);
        expect(ob.investigate.en.length).toBeGreaterThan(0);
      }
    }
  });

  it("observation keys are unique within a test", () => {
    for (const [slug, op] of Object.entries(TEST_OPERATIONAL)) {
      const keys = op.observations.map((o) => o.key);
      expect(new Set(keys).size, slug).toBe(keys.length);
    }
  });
});

describe("deficit ledger — aggregate a finding across tests", () => {
  const battery = defaultBattery().map((x) => x.slug);

  it("valgus on OHSA + single-leg squat aggregates into ONE corroborated deficit", () => {
    const fired: FiredObservation[] = [
      { testSlug: "overhead_squat", observationKey: "knees_inward", side: "both" },
      { testSlug: "single_leg_squat", observationKey: "medial_knee_valgus", side: "L" },
    ];
    const ledger = buildDeficitLedger(fired, battery);
    const valgus = ledger.find((d) => d.deficitKey === "frontal_valgus_control")!;
    expect(valgus).toBeTruthy();
    expect(valgus.supportingTests.sort()).toEqual(["overhead_squat", "single_leg_squat"]);
    expect(valgus.confidence).toBe("corroborated"); // ≥2 tests agree
    expect(valgus.sides).toContain("L");
  });

  it("a single pose-measured finding is corroborated; a single non-pose finding is provisional", () => {
    const pose = buildDeficitLedger([{ testSlug: "overhead_squat", observationKey: "knees_inward", side: "both" }], battery);
    expect(pose[0].confidence).toBe("corroborated"); // pose-measured
    const nonPose = buildDeficitLedger([{ testSlug: "overhead_squat", observationKey: "arms_fall_forward", side: "both" }], battery);
    expect(nonPose[0].confidence).toBe("provisional");
  });

  it("lists confirmation tests NOT in the recorded battery as outstanding", () => {
    const ledger = buildDeficitLedger([{ testSlug: "single_leg_squat", observationKey: "pelvic_drop", side: "R" }], battery);
    const d = ledger.find((x) => x.deficitKey === "hip_abductor_control")!;
    // sebt_lower + single_leg_hop_and_stick are in the battery → not outstanding;
    // isolated_hip_abductor_strength is NOT → outstanding
    expect(d.outstandingConfirmations).toContain("isolated_hip_abductor_strength");
    expect(d.outstandingConfirmations).not.toContain("sebt_lower");
  });

  it("union of domains + most-corroborated first", () => {
    const ledger = buildDeficitLedger([
      { testSlug: "overhead_squat", observationKey: "knees_inward", side: "both" },
      { testSlug: "single_leg_squat", observationKey: "medial_knee_valgus", side: "L" },
      { testSlug: "single_leg_squat", observationKey: "trunk_shift", side: "L" },
    ], battery);
    expect(ledger[0].deficitKey).toBe("frontal_valgus_control"); // 2 tests → leads
    expect(ledger[0].domains).toContain("strength");
  });
});

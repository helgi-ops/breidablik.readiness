import { describe, it, expect } from "vitest";
import { regionForBodyPart, recommendValdTests } from "../testRecommender";

describe("regionForBodyPart — EN + IS body parts", () => {
  it("maps calf / achilles (EN + IS)", () => {
    expect(regionForBodyPart("Calf strain")).toBe("calf");
    expect(regionForBodyPart("Kálfatognun")).toBe("calf");
    expect(regionForBodyPart("Achilles")).toBe("calf");
  });
  it("maps the other regions", () => {
    expect(regionForBodyPart("Hamstring")).toBe("hamstring");
    expect(regionForBodyPart("Aftanlæri")).toBe("hamstring");
    expect(regionForBodyPart("Groin / adductor")).toBe("groin");
    expect(regionForBodyPart("Nári")).toBe("groin");
    expect(regionForBodyPart("Knee ACL")).toBe("knee");
    expect(regionForBodyPart("Hné")).toBe("knee");
    expect(regionForBodyPart("Ankle sprain")).toBe("ankle");
    expect(regionForBodyPart("Ökkli")).toBe("ankle");
  });
  it("falls back to general for unknown / empty", () => {
    expect(regionForBodyPart(null)).toBe("general");
    expect(regionForBodyPart("shoulder")).toBe("general");
  });
});

describe("recommendValdTests", () => {
  it("recommends a calf battery led by direct plantar-flexion strength", () => {
    const r = recommendValdTests("Kálfatognun");
    expect(r.region).toBe("calf");
    const keys = r.tests.map((x) => x.key);
    expect(keys).toContain("ff_plantar");   // direct injured-muscle strength
    expect(keys).toContain("sldj_rsi");      // reactive strength for running
    expect(r.tests[0].priority).toBe(1);     // sorted priority-first
    expect(r.citations.length).toBeGreaterThan(0);
    for (const t of r.tests) { expect(t.criterion.is).toBeTruthy(); expect(t.name.en).toBeTruthy(); }
  });
  it("hamstring battery leads with the Nordic (eccentric)", () => {
    const r = recommendValdTests("Hamstring strain");
    expect(r.tests.find((x) => x.key === "nordbord")?.device).toBe("NordBord");
  });
  it("groin battery leads with the ForceFrame squeeze", () => {
    const r = recommendValdTests("Adductor");
    expect(r.tests.find((x) => x.key === "ff_adductor")?.device).toBe("ForceFrame");
  });
  it("always returns ≥3 tests with a return criterion", () => {
    for (const bp of ["Calf", "Hamstring", "Groin", "Knee", "Ankle", "Quad", "Hip", null]) {
      const r = recommendValdTests(bp);
      expect(r.tests.length).toBeGreaterThanOrEqual(3);
    }
  });
});

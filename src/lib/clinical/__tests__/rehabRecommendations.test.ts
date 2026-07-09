import { describe, it, expect } from "vitest";
import { buildRehabRecommendation } from "../rehabRecommendations";

describe("buildRehabRecommendation", () => {
  it("maps the real Hlynur groin report to the adductor protocol", () => {
    const r = buildRehabRecommendation([
      "beinbjúgur í lífbeini (bone edema in pubic bone), verkir í nára/kvið",
      "nári/kviður (groin/pubic region)",
    ]);
    expect(r.category).toBe("groin");
    expect(r.protocol?.id).toBe("groin_adductor");
    expect(r.exercises.some((e) => /copenhagen/i.test(e.name.en))).toBe(true);
    // Groin re-injury qualities: change-of-direction + sprint.
    expect(r.protectQualities.map((q) => q.key)).toEqual(expect.arrayContaining(["cod", "sprint"]));
    expect(r.protocol!.references.length).toBeGreaterThan(0);
  });

  it("maps other injuries to the right protocol", () => {
    expect(buildRehabRecommendation(["tognun í aftanlæri"]).protocol?.id).toBe("hamstring_tendinopathy");
    expect(buildRehabRecommendation(["achilles tendinopathy"]).protocol?.id).toBe("achilles_tendinopathy");
    expect(buildRehabRecommendation(["fremra krossbandsslit (hné)"]).protocol?.id).toBe("patellar_tendinopathy");
  });

  it("picks Achilles from Hlynur's active injuries (ongoing Achilles + lower back)", () => {
    // The summary route filters to ACTIVE injuries before calling this; those are
    // his ongoing bilateral Achilles + lower back (groin & old hamstring resolved).
    const r = buildRehabRecommendation([
      "stífleiki og vægir verkir", "mjóbak (lower back)",
      "langvinnir verkir (chronic pain)", "hásin (Achilles tendon)",
      "verkir (pain)", "hásin (Achilles tendon)",
    ]);
    expect(r.protocol?.id).toBe("achilles_tendinopathy");
  });

  it("returns a symptom-limited note and no loading protocol for head injury", () => {
    const r = buildRehabRecommendation(["heilahristingur"]);
    expect(r.category).toBe("head");
    expect(r.protocol).toBeNull();
    expect(r.protocolFull).toBeNull();
    expect(r.exercises).toHaveLength(0);
    expect(r.note).not.toBeNull();
  });

  it("never returns empty — unknown injuries fall back to general prevention", () => {
    const r = buildRehabRecommendation(["eitthvað óskilgreint"]);
    expect(r.category).toBe("general");
    expect(r.protocol?.id).toBe("injury_prevention_longevity");
    expect(r.exercises.length).toBeGreaterThan(0);
  });

  it("every non-head recommendation cites at least one reference", () => {
    for (const t of ["nára", "aftanlæri", "kálfi", "hné", "ökkli", "mjöðm", "framlæri", "vöðvatognun", "xyz"]) {
      const r = buildRehabRecommendation([t]);
      if (r.protocol) expect(r.protocol.references.length).toBeGreaterThan(0);
      expect(r.exercises.length).toBeGreaterThan(0);
    }
  });
});

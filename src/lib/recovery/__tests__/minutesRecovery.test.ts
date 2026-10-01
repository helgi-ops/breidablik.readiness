import { describe, it, expect } from "vitest";
import { recommendMinutesRecovery, MD_PLUS_1_SLUG, MD_PLUS_3_SLUG } from "../minutesRecovery";

describe("recommendMinutesRecovery", () => {
  it("only fires on MD+1 and MD+3", () => {
    expect(recommendMinutesRecovery({ mdContext: "MD-3", minutes: 90 })).toBeNull();
    expect(recommendMinutesRecovery({ mdContext: "OFF", minutes: 90 })).toBeNull();
    expect(recommendMinutesRecovery({ mdContext: "MD+2", minutes: 90 })).toBeNull();
  });

  it("MD+1 ≥60 min → full recovery, assigns the MD+1 bundle, protects eccentric", () => {
    const r = recommendMinutesRecovery({ mdContext: "MD+1", minutes: 88 })!;
    expect(r.action).toBe("full_recovery");
    expect(r.protocolSlug).toBe(MD_PLUS_1_SLUG);
    expect(r.protectEccentric).toBe(true);
    expect(r.caveatEN?.toLowerCase()).toContain("grade b");
  });

  it("MD+1 30–59 min → light recovery", () => {
    const r = recommendMinutesRecovery({ mdContext: "MD+1", minutes: 45 })!;
    expect(r.action).toBe("light_recovery");
    expect(r.protocolSlug).toBe(MD_PLUS_1_SLUG);
  });

  it("MD+1 <30 min OR DNP → rebuild, NO recovery protocol", () => {
    const low = recommendMinutesRecovery({ mdContext: "MD+1", minutes: 10 })!;
    expect(low.action).toBe("rebuild");
    expect(low.protocolSlug).toBeNull();
    expect(low.protectEccentric).toBe(false);
    const dnp = recommendMinutesRecovery({ mdContext: "MD+1", minutes: null, isDnp: true })!;
    expect(dnp.action).toBe("rebuild");
    expect(dnp.protocolSlug).toBeNull();
  });

  it("MD+1 unknown minutes (not DNP) → null (fall back to existing behaviour)", () => {
    expect(recommendMinutesRecovery({ mdContext: "MD+1", minutes: null })).toBeNull();
    expect(recommendMinutesRecovery({ mdContext: "MD+1", minutes: undefined })).toBeNull();
  });

  it("MD+3 high exposure, male → reload with caution, assigns MD+3 readiness, protects eccentric", () => {
    const r = recommendMinutesRecovery({ mdContext: "MD+3", minutes: 90, sex: "male" })!;
    expect(r.action).toBe("reload_caution");
    expect(r.protocolSlug).toBe(MD_PLUS_3_SLUG);
    expect(r.protectEccentric).toBe(true);
    expect(r.caveatEN?.toLowerCase()).toContain("cmj");
  });

  it("MD+3 high exposure, FEMALE → cleared (recovers physical capacity by 72h), no protocol", () => {
    const r = recommendMinutesRecovery({ mdContext: "MD+3", minutes: 90, sex: "female" })!;
    expect(r.action).toBe("reload_clear");
    expect(r.protocolSlug).toBeNull();
    expect(r.protectEccentric).toBe(false);
  });

  it("MD+3 low/moderate exposure → cleared regardless of sex", () => {
    expect(recommendMinutesRecovery({ mdContext: "MD+3", minutes: 40, sex: "male" })!.action).toBe("reload_clear");
    expect(recommendMinutesRecovery({ mdContext: "MD+3", minutes: 20, sex: "unknown" })!.action).toBe("reload_clear");
  });

  // ── GPS/IMA load-awareness: minutes is the floor; a high mechanical dose escalates ──
  it("minutes-only (no dose) → driver is 'minutes'", () => {
    expect(recommendMinutesRecovery({ mdContext: "MD+1", minutes: 88 })!.driver).toBe("minutes");
  });

  it("MD+1 partial minutes + HIGH mechanical dose → escalates to full recovery (driver 'load')", () => {
    const r = recommendMinutesRecovery({ mdContext: "MD+1", minutes: 45, mechanicalDose: "high" })!;
    expect(r.action).toBe("full_recovery");
    expect(r.driver).toBe("load");
    expect(r.protocolSlug).toBe(MD_PLUS_1_SLUG);
    expect(r.whyEN.toLowerCase()).toContain("mechanical load was high");
  });

  it("MD+1 partial minutes + low/mid dose → stays light (floor, driver 'minutes')", () => {
    expect(recommendMinutesRecovery({ mdContext: "MD+1", minutes: 45, mechanicalDose: "low" })!.action).toBe("light_recovery");
    expect(recommendMinutesRecovery({ mdContext: "MD+1", minutes: 45, mechanicalDose: "mid" })!.driver).toBe("minutes");
  });

  it("load never LOWERS the floor: full match + low dose stays full recovery", () => {
    const r = recommendMinutesRecovery({ mdContext: "MD+1", minutes: 90, mechanicalDose: "low" })!;
    expect(r.action).toBe("full_recovery");
    expect(r.driver).toBe("minutes");
  });

  it("load does NOT resurrect a DNP/low player: <30 min + high dose stays rebuild", () => {
    const r = recommendMinutesRecovery({ mdContext: "MD+1", minutes: 10, mechanicalDose: "high" })!;
    expect(r.action).toBe("rebuild");
    expect(r.protocolSlug).toBeNull();
  });

  it("MD+3 partial minutes + HIGH dose, male → escalates to reload caution", () => {
    const r = recommendMinutesRecovery({ mdContext: "MD+3", minutes: 50, sex: "male", mechanicalDose: "high" })!;
    expect(r.action).toBe("reload_caution");
    expect(r.driver).toBe("load");
    expect(r.protocolSlug).toBe(MD_PLUS_3_SLUG);
  });
});

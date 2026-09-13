import { describe, it, expect } from "vitest";
import { buildStrengthSession, md1MinutesTier } from "../index";
import type { PlayerStrengthSnapshot, MdContext } from "../types";

const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1",
  todayIso: "2026-09-08",
  mdContext: "MD+1" as MdContext,
  verdict: "FULL",
  sprintSpeedDropPct: null,
  sprintExposureBand: null,
  codAsymmetryPct: null,
  decelBurdenBand: null,
  decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null,
  injuryStatus: "cleared",
  fosterMonotony: null,
  fosterStrain: null,
  isCongestedWeek: false,
  ...over,
});

const allExercises = (s: ReturnType<typeof buildStrengthSession>) =>
  (s?.blocks ?? []).flatMap((b) => b.exercises);
const hasCategory = (s: ReturnType<typeof buildStrengthSession>, cat: string) =>
  allExercises(s).some((e) => e.category === cat);
const audit = (s: ReturnType<typeof buildStrengthSession>, ruleId: string) =>
  (s?.appliedAdaptations ?? []).some((a) => a.ruleId === ruleId);

describe("md1MinutesTier — thresholds (Carling 2018: 60 min / rebuild < 30)", () => {
  it("DNP → low regardless of minutes", () => {
    expect(md1MinutesTier(null, true)).toBe("low");
    expect(md1MinutesTier(90, true)).toBe("low");
  });
  it("unknown minutes → null (keep fixed recovery)", () => {
    expect(md1MinutesTier(null, false)).toBeNull();
    expect(md1MinutesTier(undefined, undefined)).toBeNull();
  });
  it("≥ 60 → high", () => {
    expect(md1MinutesTier(60, false)).toBe("high");
    expect(md1MinutesTier(90, false)).toBe("high");
  });
  it("30–59 → moderate", () => {
    expect(md1MinutesTier(30, false)).toBe("moderate");
    expect(md1MinutesTier(59, false)).toBe("moderate");
  });
  it("< 30 → low", () => {
    expect(md1MinutesTier(29, false)).toBe("low");
    expect(md1MinutesTier(0, false)).toBe("low");
  });
});

describe("MD+1 minutes-aware session (individualised)", () => {
  it("HIGH (played 90, RECOVERY): iso lower + fresh upper strength, NOT stripped", () => {
    const s = buildStrengthSession(snap({ lastMatchMinutes: 90, verdict: "RECOVERY" }));
    expect(s).not.toBeNull();
    expect(s!.templateId).toBe("mdplus1-iso-upper-v1");
    // Lower body is protective isometrics only — no eccentric compound / plyo.
    expect(hasCategory(s, "COMPOUND_STRENGTH")).toBe(false);
    expect(hasCategory(s, "PLYOMETRIC")).toBe(false);
    expect(hasCategory(s, "ISOMETRIC_LONG")).toBe(true);
    // Fresh upper body carries the strength stimulus (default push/pull, no palette).
    expect(hasCategory(s, "UPPER_BODY")).toBe(true);
    expect(audit(s, "MDPLUS1_UPPER_STRENGTH")).toBe(true);
    // RECOVERY did NOT strip on MD+1 high tier.
    expect(audit(s, "VERDICT_BLOCK")).toBe(false);
  });

  it("HIGH tier prefers the coach's upper palette over the default push/pull", () => {
    const s = buildStrengthSession(snap({
      lastMatchMinutes: 75,
      verdict: "RECOVERY",
      teamPalette: { upper_body: ["ex_chin_up", "ex_landmine_press"] },
    }));
    const upperIds = allExercises(s).filter((e) => e.category === "UPPER_BODY").map((e) => e.exerciseId);
    expect(upperIds).toEqual(["ex_chin_up", "ex_landmine_press"]);
  });

  it("HIGH tier but HOLD → still stripped to recovery (no upper block)", () => {
    const s = buildStrengthSession(snap({ lastMatchMinutes: 90, verdict: "HOLD" }));
    expect(hasCategory(s, "UPPER_BODY")).toBe(false);
    expect(hasCategory(s, "ISOMETRIC_LONG")).toBe(false);
    expect(audit(s, "VERDICT_BLOCK")).toBe(true);
  });

  it("LOW (played 20, FULL): a real MD-4-dosed strength session", () => {
    const s = buildStrengthSession(snap({ lastMatchMinutes: 20 }));
    expect(s!.templateId).toBe("mdplus1-strength-v1");
    expect(hasCategory(s, "COMPOUND_STRENGTH")).toBe(true);
  });

  it("LOW via DNP flag (no minutes): also the strength template", () => {
    const s = buildStrengthSession(snap({ lastMatchMinutes: null, lastMatchDnp: true }));
    expect(s!.templateId).toBe("mdplus1-strength-v1");
    expect(hasCategory(s, "COMPOUND_STRENGTH")).toBe(true);
  });

  it("MODERATE (played 45): the default recovery stim template", () => {
    const s = buildStrengthSession(snap({ lastMatchMinutes: 45 }));
    expect(s!.templateId).toBe("mdplus1-recovery-v1");
  });

  it("unknown minutes → the fixed recovery template (backwards-compatible)", () => {
    const s = buildStrengthSession(snap({ lastMatchMinutes: null, lastMatchDnp: false }));
    expect(s!.templateId).toBe("mdplus1-recovery-v1");
  });

  it("standard mode ignores minutes — always the fixed recovery template", () => {
    const s = buildStrengthSession(snap({ lastMatchMinutes: 90, verdict: "RECOVERY" }), [], { mode: "standard" });
    // RECOVERY strips in standard mode (no high-tier exception applies).
    expect(s!.templateId).toBe("mdplus1-recovery-v1");
    expect(hasCategory(s, "UPPER_BODY")).toBe(false);
  });
});

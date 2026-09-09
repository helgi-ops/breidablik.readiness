import { describe, it, expect } from "vitest";
import { buildStrengthSession } from "../index";
import { sanitizeMdStructures } from "../structures";
import type { PlayerStrengthSnapshot, MdContext } from "../types";

const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1",
  todayIso: "2026-09-08",
  mdContext: "MD-4" as MdContext,
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

const allEx = (s: ReturnType<typeof buildStrengthSession>) =>
  (s?.blocks ?? []).flatMap((b) => b.exercises.map((e) => e.exerciseId));
const hasAudit = (s: ReturnType<typeof buildStrengthSession>, id: string) =>
  (s?.appliedAdaptations ?? []).some((a) => a.ruleId === id);

describe("coach MD→structure choice → buildStrengthSession", () => {
  it("no choice → the built-in MD-4 template (byte-identical fast-path)", () => {
    const s = buildStrengthSession(snap());
    expect(s?.templateId).toBe("md4-microdose-v1");
    expect(hasAudit(s, "STRUCTURE_APPLIED")).toBe(false);
  });

  it("choosing the DEFAULT method keeps the built-in template (no rebuild)", () => {
    const s = buildStrengthSession(snap({ mdStructures: { "MD-4": "cluster" } }));
    expect(s?.templateId).toBe("md4-microdose-v1");
    expect(hasAudit(s, "STRUCTURE_APPLIED")).toBe(false);
  });

  it("choosing a NON-default method rebuilds the session as that method", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-4" as MdContext, mdStructures: { "MD-4": "contrast" } }));
    expect(s?.templateId).toBe("struct-contrast-MD-4");
    expect(hasAudit(s, "STRUCTURE_APPLIED")).toBe(true);
    // Contrast pairs a heavy lift with a plyometric — the plyo default is present.
    expect(allEx(s)).toContain("ex_box_jump");
    // Injury-prevention survives the rebuild (non-negotiable).
    expect(allEx(s)).toContain("ex_nordic_curl");
    expect(allEx(s)).toContain("ex_copenhagen");
  });

  it("French contrast on MD-4 lays out the 4-part complex (dose falls back from MD-3)", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-4" as MdContext, mdStructures: { "MD-4": "french_contrast" } }));
    expect(s?.templateId).toBe("struct-french_contrast-MD-4");
    expect(allEx(s)).toContain("ex_trap_bar_jump_squat"); // loaded jump slot
  });

  it("standard mode ignores the structure choice", () => {
    const s = buildStrengthSession(snap({ mdStructures: { "MD-4": "contrast" } }), [], { mode: "standard" });
    expect(s?.templateId).toBe("md4-microdose-v1");
    expect(hasAudit(s, "STRUCTURE_APPLIED")).toBe(false);
  });

  it("a method on a non-configurable day is ignored (guarded)", () => {
    // MD-1 is not configurable; even if a snapshot carries one, the engine won't apply it.
    const s = buildStrengthSession(snap({ mdContext: "MD-1" as MdContext, mdStructures: { "MD-1": "contrast" } as never }));
    expect(s?.templateId).toBe("md1-primer-v1");
    expect(hasAudit(s, "STRUCTURE_APPLIED")).toBe(false);
  });
});

describe("sanitizeMdStructures", () => {
  it("keeps valid MD→method entries, drops disallowed days + unknown methods", () => {
    const out = sanitizeMdStructures({ "MD-4": "contrast", "MD-3": "french_contrast", "MD-1": "contrast", "MD-2": "cluster", "MD-4-bogus": "x" });
    expect(out).toEqual({ "MD-4": "contrast", "MD-3": "french_contrast" });
  });
  it("drops a method not allowed for that day", () => {
    // (all four are allowed on MD-4/MD-3; use an unknown key to prove filtering)
    const out = sanitizeMdStructures({ "MD-4": "not_a_method" });
    expect(out).toEqual({});
  });
  it("non-object → empty", () => {
    expect(sanitizeMdStructures(null)).toEqual({});
    expect(sanitizeMdStructures("x")).toEqual({});
  });
});

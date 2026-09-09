import { describe, it, expect } from "vitest";
import { buildStrengthSession } from "../index";
import { sanitizeMdStructures, readinessDowngrade } from "../structures";
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

  it("a strength method on a taper day is ignored (guarded — not in the allow-list)", () => {
    // 'contrast' (heavy) is not allowed on MD-1; the engine won't apply it.
    const s = buildStrengthSession(snap({ mdContext: "MD-1" as MdContext, mdStructures: { "MD-1": "contrast" } as never }));
    expect(s?.templateId).toBe("md1-primer-v1");
    expect(hasAudit(s, "STRUCTURE_APPLIED")).toBe(false);
  });

  it("MD-2 with no choice → the built-in activation template (unchanged)", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-2" as MdContext }));
    expect(s?.templateId).toBe("md2-microdose-v1");
    expect(hasAudit(s, "STRUCTURE_APPLIED")).toBe(false);
  });

  it("power contrast on MD-2 → velocity contrast (loaded fast lift + plyo, no eccentric prevention)", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-2" as MdContext, mdStructures: { "MD-2": "power_contrast" } }));
    expect(s?.templateId).toBe("struct-power_contrast-MD-2");
    expect(hasAudit(s, "STRUCTURE_APPLIED")).toBe(true);
    expect(allEx(s)).toContain("ex_box_jump");
    // Taper day → Nordic/Copenhagen are NOT loaded onto the primer.
    expect(allEx(s)).not.toContain("ex_nordic_curl");
    expect(allEx(s)).not.toContain("ex_copenhagen");
  });

  it("potentiation cluster on MD-1 → explosive cluster (velocity-based), dose falls back from MD-2", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-1" as MdContext, mdStructures: { "MD-1": "potentiation_cluster" } }));
    expect(s?.templateId).toBe("struct-potentiation_cluster-MD-1");
    expect(hasAudit(s, "STRUCTURE_APPLIED")).toBe(true);
    const main = s?.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === "ex_trap_bar_jump_squat");
    expect(main).toBeTruthy();
    expect(main?.dose.velocityLossCap).toBe(10); // velocity-based
  });

  it("overcoming isometric on MD-4 → max-strength iso, prevention kept (strength day)", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-4" as MdContext, mdStructures: { "MD-4": "overcoming_isometric" } }));
    expect(s?.templateId).toBe("struct-overcoming_isometric-MD-4");
    expect(hasAudit(s, "STRUCTURE_APPLIED")).toBe(true);
    expect(allEx(s)).toContain("ex_iso_squat_90");
    expect(allEx(s)).toContain("ex_nordic_curl"); // strength day keeps prevention
  });

  it("isometric PAP primer on MD-2 → iso conditioning + explosive set, no prevention (taper)", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-2" as MdContext, mdStructures: { "MD-2": "iso_pap_primer" } }));
    expect(s?.templateId).toBe("struct-iso_pap_primer-MD-2");
    expect(allEx(s)).toContain("ex_iso_squat_90"); // the conditioning activity
    expect(allEx(s)).toContain("ex_box_jump");     // the potentiated explosive set
    expect(allEx(s)).not.toContain("ex_nordic_curl");
  });

  it("the coach's isometric palette pick fills the iso slot", () => {
    const s = buildStrengthSession(snap({
      mdContext: "MD-4" as MdContext,
      mdStructures: { "MD-4": "overcoming_isometric" },
      teamPalette: { isometric: ["ex_imtp_iso"] },
    }));
    expect(allEx(s)).toContain("ex_imtp_iso");
    expect(allEx(s)).not.toContain("ex_iso_squat_90");
  });
});

describe("readiness downgrade of the method (yellow steps down)", () => {
  it("green (FULL) keeps the chosen method", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-4" as MdContext, verdict: "FULL", mdStructures: { "MD-4": "french_contrast" } }));
    expect(s?.templateId).toBe("struct-french_contrast-MD-4");
    expect(hasAudit(s, "STRUCTURE_READINESS_DOWNGRADE")).toBe(false);
  });

  it("yellow (REDUCED) steps French contrast down to Contrast", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-4" as MdContext, verdict: "REDUCED", mdStructures: { "MD-4": "french_contrast" } }));
    expect(s?.templateId).toBe("struct-contrast-MD-4");
    expect(hasAudit(s, "STRUCTURE_READINESS_DOWNGRADE")).toBe(true);
    expect(hasAudit(s, "STRUCTURE_APPLIED")).toBe(false);
  });

  it("yellow downgrades the DAY DEFAULT too, even with no explicit choice (MD-3 french contrast → contrast)", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-3" as MdContext, verdict: "MODIFIED" }));
    expect(s?.templateId).toBe("struct-contrast-MD-3");
    expect(hasAudit(s, "STRUCTURE_READINESS_DOWNGRADE")).toBe(true);
  });

  it("a downgrade landing on the day default uses the built-in template but still records the downgrade", () => {
    // MD-4 explicit Contrast(5), yellow → next lower allowed = Cluster(4) = MD-4 default.
    const s = buildStrengthSession(snap({ mdContext: "MD-4" as MdContext, verdict: "MODIFIED", mdStructures: { "MD-4": "contrast" } }));
    expect(s?.templateId).toBe("md4-microdose-v1"); // the richer default template
    expect(hasAudit(s, "STRUCTURE_READINESS_DOWNGRADE")).toBe(true);
  });

  it("standard mode never downgrades the method", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-4" as MdContext, verdict: "REDUCED", mdStructures: { "MD-4": "french_contrast" } }), [], { mode: "standard" });
    expect(s?.templateId).toBe("md4-microdose-v1");
    expect(hasAudit(s, "STRUCTURE_READINESS_DOWNGRADE")).toBe(false);
  });

  it("readinessDowngrade: French contrast → Contrast on MD-3; nothing below the lightest → null", () => {
    expect(readinessDowngrade("french_contrast", "MD-3")).toBe("contrast");
    expect(readinessDowngrade("straight_sets", "MD-4")).toBeNull(); // already lowest allowed
  });
});

describe("sanitizeMdStructures", () => {
  it("keeps valid MD→method entries, drops methods not allowed for that day", () => {
    const out = sanitizeMdStructures({
      "MD-4": "contrast",              // allowed
      "MD-3": "french_contrast",       // allowed
      "MD-2": "power_contrast",        // allowed (velocity method)
      "MD-1": "potentiation_cluster",  // allowed (explosive method)
      "MD+1": "contrast",              // MD+1 not configurable → dropped
    });
    expect(out).toEqual({ "MD-4": "contrast", "MD-3": "french_contrast", "MD-2": "power_contrast", "MD-1": "potentiation_cluster" });
  });

  it("drops a heavy strength method placed on a taper day", () => {
    // 'cluster' (heavy) is not allowed on MD-2; 'contrast' (heavy) not on MD-1.
    expect(sanitizeMdStructures({ "MD-2": "cluster", "MD-1": "contrast" })).toEqual({});
  });

  it("allows the isometric methods on their days, drops them off-day", () => {
    expect(sanitizeMdStructures({ "MD-4": "overcoming_isometric", "MD-2": "iso_pap_primer" }))
      .toEqual({ "MD-4": "overcoming_isometric", "MD-2": "iso_pap_primer" });
    // iso_pap_primer is not allowed on MD-4 (strength day) → dropped.
    expect(sanitizeMdStructures({ "MD-4": "iso_pap_primer" })).toEqual({});
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

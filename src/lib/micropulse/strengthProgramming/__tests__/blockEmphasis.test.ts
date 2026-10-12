import { describe, it, expect } from "vitest";
import { applyBlockToSession, playerBlockLean } from "../blockEmphasis";
import type { StrengthSession, SessionBlock } from "../types";
import type { MdStructures } from "../structures";

function block(type: SessionBlock["type"], sets: number): SessionBlock {
  return {
    id: `${type}-1`, titleEN: type, titleIS: type, type,
    exercises: [{ exerciseId: "x", nameEN: "X", nameIS: "X", category: "COMPOUND_STRENGTH", dose: { sets, reps: "5", intensity: "80%", rest: "120s" } }],
  };
}

function session(blocks: SessionBlock[]): StrengthSession {
  return {
    playerId: "p", mdContext: "MD-4", templateId: "t", durationMin: 40, vbtAutoRegulated: false, isCompressed: false,
    blocks, appliedAdaptations: [], summaryEN: "", summaryIS: "", confidence: 0.5,
  };
}

describe("applyBlockToSession — the meso volume tilt", () => {
  it("pre-season Accumulation adds a set to accessory/compound volume", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 3), block("POWER_PRIMER", 3)]), "accum", "preseason");
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(4); // compound +1
    expect(out!.blocks[1].exercises[0].dose.sets).toBe(3); // power primer untouched (output work)
    expect(out!.blockEmphasis?.goalKey).toBe("accum");
    expect(out!.appliedAdaptations.some((a) => a.ruleId === "BLOCK_ACCUM")).toBe(true);
  });

  it("Realization trims a set off volume work but keeps power/contrast", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 4), block("FRENCH_CONTRAST", 4)]), "realize", "competitive");
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(3); // compound -1
    expect(out!.blocks[1].exercises[0].dose.sets).toBe(4); // contrast kept
  });

  it("Deload halves accessory/compound volume (floor 1)", () => {
    const out = applyBlockToSession(session([block("ACCESSORY", 4), block("UNILATERAL", 1)]), "deload", "competitive");
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(2); // 4 -> 2
    expect(out!.blocks[1].exercises[0].dose.sets).toBe(1); // 1 -> floor 1
  });

  it("Transmutation keeps dosing (note only, no adaptation row)", () => {
    const inp = session([block("COMPOUND", 4)]);
    const out = applyBlockToSession(inp, "transmute", "competitive");
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(4);
    expect(out!.blockEmphasis?.goalKey).toBe("transmute");
    expect(out!.appliedAdaptations.length).toBe(0);
  });

  it("in-season Accumulation does not inflate volume (note only)", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 3)]), "accum", "competitive");
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(3);
  });

  it("surfaces the block's %1RM + exercise setups on blockEmphasis (default)", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 3)]), "accum", "preseason");
    expect(out!.blockEmphasis?.pct1rm?.en).toMatch(/65–80/);
    expect(out!.blockEmphasis?.methods).toContain("straight");
  });

  it("a coach override flows through to blockEmphasis.pct1rm + methods (the bridge payload)", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 3)]), "transmute", "competitive",
      { pct1rm: { en: "90% 1RM", is: "90% 1RM" }, methods: ["french_contrast"] });
    expect(out!.blockEmphasis?.pct1rm?.en).toBe("90% 1RM");
    expect(out!.blockEmphasis?.methods).toEqual(["french_contrast"]);
  });

  it("null goal / no blocks / null session returned unchanged", () => {
    const inp = session([block("COMPOUND", 3)]);
    expect(applyBlockToSession(inp, null, "preseason")).toBe(inp);
    expect(applyBlockToSession(null, "accum", "preseason")).toBeNull();
  });

  it("does not mutate the input session", () => {
    const inp = session([block("COMPOUND", 3)]);
    applyBlockToSession(inp, "accum", "preseason");
    expect(inp.blocks[0].exercises[0].dose.sets).toBe(3);
  });
});

describe("traditional weekly-volume equate — pile the dropped days onto the lift day", () => {
  // MD-4 lift day, with MD-3 + MD-1 marked Off → lift pool is MD-4 + MD-2 (weights 105 + 55 = 160)
  // of the full 285, so the scale is ~1.78× on the lift day.
  const OFF: MdStructures = { "MD-3": "rest", "MD-1": "rest" };
  const withOff = (blocks: Parameters<typeof session>[0]): StrengthSession =>
    ({ ...session(blocks), mdStructures: OFF });

  it("scales the main strength volume on a traditional lift day (3 → 5 sets)", () => {
    const out = applyBlockToSession(withOff([block("COMPOUND", 3), block("POWER_PRIMER", 3)]), "transmute", "competitive", { mode: "traditional" });
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(5); // 3 × ~1.78 → 5
    expect(out!.blocks[1].exercises[0].dose.sets).toBe(3); // power/output work NOT scaled
    expect(out!.blockEmphasis?.volumeScale).toBeGreaterThan(1);
    expect(out!.appliedAdaptations.some((a) => a.ruleId === "TRADITIONAL_VOLUME_EQUATE")).toBe(true);
  });

  it("never scales injury-prevention (Nordic/Copenhagen) volume", () => {
    const out = applyBlockToSession(withOff([block("POSTERIOR", 3), block("ADDUCTOR", 2)]), "transmute", "competitive", { mode: "traditional" });
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(3); // prevention untouched
    expect(out!.blocks[1].exercises[0].dose.sets).toBe(2);
    expect(out!.appliedAdaptations.some((a) => a.ruleId === "TRADITIONAL_VOLUME_EQUATE")).toBe(false);
  });

  it("clamps the scaled volume to 6 sets (never balloons)", () => {
    const out = applyBlockToSession(withOff([block("COMPOUND", 5)]), "transmute", "competitive", { mode: "traditional" });
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(6); // 5 × 1.78 = 8.9 → clamp 6
  });

  it("microdose (no mode) does NOT equate — fewer days at the normal dose", () => {
    const out = applyBlockToSession(withOff([block("COMPOUND", 3)]), "transmute", "competitive");
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(3);
    expect(out!.blockEmphasis?.volumeScale).toBeUndefined();
  });

  it("traditional with NO Off days → no concentration (scale 1)", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 3)]), "transmute", "competitive", { mode: "traditional" });
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(3);
  });

  it("a day that is itself Off is not scaled (it delivers no session anyway)", () => {
    const s: StrengthSession = { ...session([block("COMPOUND", 3)]), mdContext: "MD-3", mdStructures: OFF };
    const out = applyBlockToSession(s, "transmute", "competitive", { mode: "traditional" });
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(3); // MD-3 itself Off → scale 1
  });
});

describe("playerBlockLean — the per-player lean within the block (b)", () => {
  it("Accumulation × max_strength → bias compound heavier", () => {
    expect(playerBlockLean("accum", "max_strength")!.en).toMatch(/heavier/i);
  });
  it("Realization × power → this is his block", () => {
    expect(playerBlockLean("realize", "power")!.en).toMatch(/his block/i);
  });
  it("injury-prevention priority overrides the block tilt", () => {
    expect(playerBlockLean("transmute", "injury_prevention_priority")!.en).toMatch(/Nordic|Copenhagen/i);
  });
  it("no lean on deload / missing inputs", () => {
    expect(playerBlockLean("deload", "power")).toBeNull();
    expect(playerBlockLean("accum", null)).toBeNull();
    expect(playerBlockLean(null, "power")).toBeNull();
  });
});

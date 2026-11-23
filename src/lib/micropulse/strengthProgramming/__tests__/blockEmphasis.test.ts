import { describe, it, expect } from "vitest";
import { applyBlockToSession as applyWithDayRule, applyBlockToSessionInner as applyBlockToSession, playerBlockLean } from "../blockEmphasis";
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

describe("applyBlockToSession — in-season fixture-density sub-phase dose", () => {
  // transmute in-season carries no block set-delta, so these isolate the sub-phase multiplier.
  it("re_strength loads the main work a little heavier (×1.25)", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 3), block("POWER_PRIMER", 3)]), "transmute", "competitive", null, "re_strength");
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(4); // 3 → 3.75 → 4
    expect(out!.blocks[1].exercises[0].dose.sets).toBe(3); // power never scaled
    expect(out!.blockEmphasis?.subPhaseKey).toBe("re_strength");
    expect(out!.appliedAdaptations.some((a) => a.ruleId === "SUBPHASE_RE_STRENGTH")).toBe(true);
  });

  it("maintain_potentiate collapses the main work to a potentiation dose (×0.5)", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 4)]), "transmute", "competitive", null, "maintain_potentiate");
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(2); // 4 → 2
    expect(out!.blockEmphasis?.subPhaseScale).toBe(0.5);
  });

  it("taper cuts volume but never touches intensity (%1RM)", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 5)]), "transmute", "competitive", null, "taper");
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(3); // 5 → 3.0 → 3
    expect(out!.blocks[0].exercises[0].dose.intensity).toBe("80%"); // intensity unchanged
  });

  it("sharpen is the baseline — no change, no audit", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 3)]), "transmute", "competitive", null, "sharpen");
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(3);
    expect(out!.appliedAdaptations.some((a) => a.ruleId.startsWith("SUBPHASE_"))).toBe(false);
  });

  it("never scales injury-prevention (posterior/adductor) or power work", () => {
    const out = applyBlockToSession(session([block("POSTERIOR", 3), block("FRENCH_CONTRAST", 3)]), "transmute", "competitive", null, "maintain_potentiate");
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(3); // Nordic dose protected
    expect(out!.blocks[1].exercises[0].dose.sets).toBe(3); // output work protected
  });

  it("composes with the meso block tilt (Realization trim THEN the sub-phase cut)", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 4)]), "realize", "competitive", null, "maintain_potentiate");
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(2); // 4 → trim 3 → ×0.5 → 1.5 → 2
    expect(out!.appliedAdaptations.some((a) => a.ruleId === "BLOCK_REALIZE")).toBe(true);
    expect(out!.appliedAdaptations.some((a) => a.ruleId === "SUBPHASE_MAINTAIN_POTENTIATE")).toBe(true);
  });

  it("no sub-phase (pre-season / unspecified) → unchanged", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 3)]), "transmute", "competitive", null, null);
    expect(out!.blocks[0].exercises[0].dose.sets).toBe(3);
    expect(out!.blockEmphasis?.subPhaseKey).toBeUndefined();
  });
});

describe("applyBlockToSession — coach's bar-speed method", () => {
  it("carries a valid method, sanitised", () => {
    const out = applyBlockToSession(session([block("COMPOUND", 3)]), "transmute", "competitive",
      { vbt: { method: "fixed_set_vl", velocityLossPct: 20, repCap: 5 } });
    expect(out!.blockEmphasis?.vbt).toEqual({ method: "fixed_set_vl", velocityLossPct: 20 });
  });

  it("drops an incomplete or unknown method", () => {
    const a = applyBlockToSession(session([block("COMPOUND", 3)]), "transmute", "competitive",
      { vbt: { method: "fixed_set_vl_rep_cap", velocityLossPct: 10 } });
    expect(a!.blockEmphasis?.vbt).toBeUndefined();
    const b = applyBlockToSession(session([block("COMPOUND", 3)]), "transmute", "competitive", null);
    expect(b!.blockEmphasis?.vbt).toBeUndefined();
  });
});

describe("applyBlockToSession — the day rule is checked again after the block (dayRules.ts, 2026-11-22)", () => {
  it("a set the block adds over MD-4's 12 heavy reps a lift is taken back off, with the reason", () => {
    const heavy = (sets: number): SessionBlock => ({
      id: "c", titleEN: "C", titleIS: "C", type: "COMPOUND",
      exercises: [{ exerciseId: "ex_trap_bar_dl", nameEN: "Trap-bar deadlift", nameIS: "Trap bar", category: "COMPOUND_STRENGTH", dose: { sets, reps: "3", intensity: "85% 1RM", rest: "3 min" } }],
    });
    const inner = applyBlockToSession(session([heavy(4)]), "accum", "preseason")!;
    expect(inner.blocks[0].exercises[0].dose.sets).toBe(5); // the block alone: 5 × 3 = 15
    const out = applyWithDayRule(session([heavy(4)]), "accum", "preseason")!;
    expect(out.blocks[0].exercises[0].dose.sets).toBe(4); // 4 × 3 = 12
    expect(out.appliedAdaptations.some((a) => a.ruleId === "DAY_RULE_TRIM" && /12 heavy reps/.test(a.triggerEN))).toBe(true);
  });
});

describe("the week rule's fixed doses hold through the meso layer (the coach's call, 2026-11-23)", () => {
  const fixed = (): StrengthSession => session([
    { id: "c", titleEN: "C", titleIS: "C", type: "COMPOUND", exercises: [
      { exerciseId: "ex_trap_bar_dl", nameEN: "Trap bar deadlift", nameIS: "Trap bar", category: "COMPOUND_STRENGTH", dose: { sets: 4, reps: "3", intensity: "85% 1RM", rest: "3 min", weekRule: true } },
      { exerciseId: "x_acc", nameEN: "Accessory", nameIS: "Aukaæfing", category: "COMPOUND_STRENGTH", dose: { sets: 4, reps: "8", intensity: "70%", rest: "90s" } },
    ] },
    { id: "p", titleEN: "P", titleIS: "P", type: "POSTERIOR", exercises: [
      { exerciseId: "ex_nordic_curl", nameEN: "Nordic", nameIS: "Nordic", category: "POSTERIOR_CHAIN", dose: { sets: 4, reps: "5", intensity: "BW", rest: "90s" } },
    ] },
    { id: "a", titleEN: "A", titleIS: "A", type: "ADDUCTOR", exercises: [
      { exerciseId: "ex_copenhagen", nameEN: "Copenhagen", nameIS: "Copenhagen", category: "ADDUCTOR", dose: { sets: 4, reps: "6 each side", intensity: "BW", rest: "60s" } },
    ] },
  ]);
  const sets = (s: StrengthSession | null, id: string) => s!.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === id)!.dose.sets;

  it("deload: Nordic and Copenhagen stay 4; the week rule's heavy sets halve, with a line; other work halves", () => {
    const out = applyBlockToSession(fixed(), "deload", "preseason");
    expect(sets(out, "ex_nordic_curl")).toBe(4);
    expect(sets(out, "ex_copenhagen")).toBe(4);
    expect(sets(out, "ex_trap_bar_dl")).toBe(2);
    expect(sets(out, "x_acc")).toBe(2);
    const line = out!.appliedAdaptations.find((a) => a.ruleId === "WEEK_RULE_DELOAD")!;
    expect(line.actionEN).toMatch(/Heavy sets halved this week \(Trap bar deadlift 4 → 2\)\. Nordic and Copenhagen stay as every week\./);
    expect(line.actionIS).toMatch(/Þung sett helminguð/);
    expect(line.evidence).toMatch(/MicroPulse rule/);
  });

  it("Realization: heavy sets and prevention kept; only other work trimmed; no deload line", () => {
    const out = applyBlockToSession(fixed(), "realize", "competitive");
    expect(sets(out, "ex_trap_bar_dl")).toBe(4);
    expect(sets(out, "ex_nordic_curl")).toBe(4);
    expect(sets(out, "ex_copenhagen")).toBe(4);
    expect(sets(out, "x_acc")).toBe(3);
    expect(out!.appliedAdaptations.some((a) => a.ruleId === "WEEK_RULE_DELOAD")).toBe(false);
  });

  it("pre-season accumulation never adds to prevention or the week rule's sets", () => {
    const out = applyBlockToSession(fixed(), "accum", "preseason");
    expect(sets(out, "ex_nordic_curl")).toBe(4);
    expect(sets(out, "ex_trap_bar_dl")).toBe(4);
    expect(sets(out, "x_acc")).toBe(5);
  });

  it("in-season sub-phases (×0.5 congested, ×1.25 re-strength) leave the heavy reps and prevention alone", () => {
    for (const sub of ["maintain_potentiate", "re_strength", "taper"] as const) {
      const out = applyBlockToSession(fixed(), "transmute", "competitive", null, sub);
      expect(sets(out, "ex_trap_bar_dl")).toBe(4);
      expect(sets(out, "ex_nordic_curl")).toBe(4);
      expect(sets(out, "ex_copenhagen")).toBe(4);
    }
    expect(sets(applyBlockToSession(fixed(), "transmute", "competitive", null, "maintain_potentiate"), "x_acc")).toBe(2);
  });
});

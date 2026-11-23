/**
 * A hand send follows a later check-in on Today (handSentAdjust.ts, contradiction 12): only when today's colour is
 * worse than the colour it was built with; never twice; auto and corrective sends are left alone.
 */
import { describe, expect, it } from "vitest";
import { handSentAdjustLine, handSentLevel, isPrepBlock, levelOfVerdict, prepOnly } from "../handSentAdjust";
import { strengthSessionToTodayStructure } from "../toTodayStructure";
import { buildStrengthSession } from "..";
import type { PlayerStrengthSnapshot } from "../types";

describe("handSentLevel", () => {
  it("sent before check-in (built without a colour): yellow and red adjust, green does not", () => {
    for (const origin of ["session", "bulk", "block", null]) {
      expect(handSentLevel({ origin, builtWith: null, todayColour: "YELLOW" })).toBe("YELLOW");
      expect(handSentLevel({ origin, builtWith: null, todayColour: "red" })).toBe("RED");
      expect(handSentLevel({ origin, builtWith: null, todayColour: "GREEN" })).toBeNull();
    }
  });

  it("not checked in yet → as sent", () => {
    expect(handSentLevel({ origin: "session", builtWith: null, todayColour: null })).toBeNull();
  });

  it("never twice: built with yellow is not cut again on yellow; red still goes to warm-up only", () => {
    expect(handSentLevel({ origin: "bulk", builtWith: "YELLOW", todayColour: "YELLOW" })).toBeNull();
    expect(handSentLevel({ origin: "bulk", builtWith: "YELLOW", todayColour: "RED" })).toBe("RED");
    expect(handSentLevel({ origin: "session", builtWith: "RED", todayColour: "RED" })).toBeNull();
    expect(handSentLevel({ origin: "session", builtWith: "RED", todayColour: "YELLOW" })).toBeNull();
  });

  it("the automatic send (rebuilt at check-in) and the corrective send are left alone", () => {
    expect(handSentLevel({ origin: "auto", builtWith: null, todayColour: "RED" })).toBeNull();
    expect(handSentLevel({ origin: "corrective", builtWith: null, todayColour: "RED" })).toBeNull();
  });

  it("verdict → colour", () => {
    expect(levelOfVerdict("FULL")).toBe("GREEN");
    expect(levelOfVerdict("MODIFIED")).toBe("YELLOW");
    expect(levelOfVerdict("RECOVERY")).toBe("RED");
    expect(levelOfVerdict(null)).toBeNull();
  });
});

describe("red day: warm-up and mobility only", () => {
  it("by kind when marked, else by title; a marked strength block is never prep", () => {
    expect(isPrepBlock({ block: "A. Back squat", kind: "prep" })).toBe(true);
    expect(isPrepBlock({ block: "Warm-up flow" })).toBe(true);
    expect(isPrepBlock({ block: "Hreyfilína + mobility flush" })).toBe(true);
    expect(isPrepBlock({ block: "Corrective (movement screen)" })).toBe(true);
    expect(isPrepBlock({ block: "Lower body" })).toBe(false);
    expect(isPrepBlock({ block: "Mobility-looking name", kind: "other" })).toBe(false);
  });

  it("the 4-week block's one strength block leaves nothing, and the line says the session waits", () => {
    expect(prepOnly([{ block: "Lower body", items: [] }])).toEqual([]);
    expect(handSentAdjustLine("RED", false, true)).toContain("waits");
    expect(handSentAdjustLine("RED", true, false)).toContain("upphitun og liðleiki");
    expect(handSentAdjustLine("YELLOW", false, false)).toContain("one set comes off each line");
  });

  it("an engine session marks its prep and mobility blocks, so red keeps exactly those", () => {
    const snap: PlayerStrengthSnapshot = {
      playerId: "p1", todayIso: "2026-11-23", mdContext: "MD-3", verdict: null,
      sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
      wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
      vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false, seasonPhase: "inseason",
    };
    const s = buildStrengthSession(snap, [], { mode: "individualised" })!;
    const structure = strengthSessionToTodayStructure(s, "EN");
    const prepTypes = s.blocks.filter((b) => b.exercises.length && (b.type === "PREP" || b.type === "MOBILITY")).length;
    expect(structure.filter((b) => b.kind === "prep").length).toBe(prepTypes + (s.correctives?.length ? 1 : 0));
    expect(prepOnly(structure).length).toBeLessThan(structure.length);
  });
});

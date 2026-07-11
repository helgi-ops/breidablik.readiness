import { describe, it, expect } from "vitest";
import { strengthSessionToTodayStructure } from "../toTodayStructure";
import type { StrengthSession } from "../types";

/**
 * The converter is the contract that makes "coach sent = player sees": its
 * output MUST be the exact shape the player Today card renders —
 *   [{ block: string, items: [{ name, sets, reps, rest, method?, note? }] }]
 * (consumed by buildSessionBlocks → blockItemToRawString in PlayerClient).
 */

function makeSession(overrides: Partial<StrengthSession> = {}): StrengthSession {
  return {
    playerId: "p1",
    playerName: "Test Player",
    mdContext: "MD-1",
    templateId: "md1-primer-v1",
    durationMin: 22,
    vbtAutoRegulated: false,
    isCompressed: false,
    blocks: [
      {
        id: "prep",
        titleEN: "Movement Prep",
        titleIS: "Upphitun",
        type: "PREP",
        exercises: [
          {
            exerciseId: "leg-swings",
            nameEN: "Leg Swings",
            nameIS: "Fótasveiflur",
            category: "MOVEMENT_PREP",
            dose: { sets: 1, reps: "10/side", intensity: "RPE 3", rest: "0s", cue: "controlled" },
          },
        ],
      },
      {
        id: "primer",
        titleEN: "Power Primer",
        titleIS: "Kraftvakning",
        type: "POWER_PRIMER",
        exercises: [
          {
            exerciseId: "trap-bar-jump",
            nameEN: "Trap-Bar Jump",
            nameIS: "Trap-bar stökk",
            category: "BALLISTIC",
            dose: { sets: 4, reps: "3", intensity: "30% 1RM", rest: "90s" },
            modificationReason: "Swapped from depth jump — sore quads",
          },
        ],
      },
      // Empty block must be dropped.
      { id: "empty", titleEN: "Empty", titleIS: "Tómt", type: "ACCESSORY", exercises: [] },
    ],
    appliedAdaptations: [],
    summaryEN: "MD-1 primer",
    summaryIS: "MD-1 kraftvakning",
    confidence: 0.8,
    ...overrides,
  };
}

describe("strengthSessionToTodayStructure", () => {
  it("produces the Today card structure shape (block + items)", () => {
    const out = strengthSessionToTodayStructure(makeSession(), "EN");
    expect(out).toHaveLength(2); // empty block dropped
    expect(out[0].block).toBe("Movement Prep");
    expect(out[1].block).toBe("Power Primer");
    const primer = out[1].items[0];
    expect(primer.name).toBe("Trap-Bar Jump");
    expect(primer.sets).toBe(4);
    expect(primer.reps).toBe("3");
    expect(primer.rest).toBe("90s");
  });

  it("carries intensity+cue as method and modificationReason as note (the 'why')", () => {
    const out = strengthSessionToTodayStructure(makeSession(), "EN");
    const prep = out[0].items[0];
    expect(prep.method).toBe("RPE 3 · controlled");
    const primer = out[1].items[0];
    expect(primer.method).toBe("30% 1RM"); // no cue → intensity only
    expect(primer.note).toBe("Swapped from depth jump — sore quads");
  });

  it("uses IS names when lang is IS", () => {
    const out = strengthSessionToTodayStructure(makeSession(), "IS");
    expect(out[0].block).toBe("Upphitun");
    expect(out[1].items[0].name).toBe("Trap-bar stökk");
  });

  it("drops blocks with no exercises", () => {
    const out = strengthSessionToTodayStructure(makeSession(), "EN");
    expect(out.some((b) => b.block === "Empty")).toBe(false);
  });
});

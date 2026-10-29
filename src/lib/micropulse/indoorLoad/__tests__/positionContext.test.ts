import { describe, it, expect } from "vitest";
import { basketballFamily, familyLabel, positionLoadNote, positionGeneralNote, POSITION_LOAD_CITATION } from "../positionContext";

describe("basketballFamily", () => {
  it("folds guard positions", () => {
    for (const p of ["PG", "SG", "G", "Guard", "Point Guard", "Shooting Guard"]) expect(basketballFamily(p)).toBe("guard");
  });
  it("folds big positions", () => {
    for (const p of ["C", "PF", "Center", "Centre", "Power Forward"]) expect(basketballFamily(p)).toBe("big");
  });
  it("folds wings (and unknown) to wing", () => {
    for (const p of ["SF", "F", "Forward", "Small Forward", "Wing", "???"]) expect(basketballFamily(p)).toBe("wing");
  });
  it("returns null when no position is set (never guesses)", () => {
    expect(basketballFamily(null)).toBeNull();
    expect(basketballFamily("")).toBeNull();
    expect(basketballFamily("   ")).toBeNull();
  });
});

describe("notes are bilingual, cited, and personal-norm framed", () => {
  it("labels each family in both languages", () => {
    expect(familyLabel("guard", true)).toBe("Guard");
    expect(familyLabel("big", false)).toBe("Miðherji");
  });
  it("every family note points back to the player's own norm", () => {
    for (const f of ["guard", "wing", "big"] as const) {
      expect(positionLoadNote(f, true).toLowerCase()).toContain("own norm");
      expect(positionLoadNote(f, false).toLowerCase()).toContain("eigin viðmiðun");
    }
  });
  it("the general note carries the citation and the own-norm framing", () => {
    expect(POSITION_LOAD_CITATION).toMatch(/Zhang/);
    expect(positionGeneralNote(true)).toContain("Zhang et al. 2026");
    expect(positionGeneralNote(true).toLowerCase()).toContain("own 28-day norm");
  });
});

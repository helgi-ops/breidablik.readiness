import { describe, it, expect } from "vitest";
import { coerceInjuryType, INJURY_TYPE_ENUM } from "../extractReport";

describe("coerceInjuryType", () => {
  it("maps the real Hlynur groin report onto the enum", () => {
    // The exact free-text that broke the confirm insert.
    const t = 'beinbjúgur í lífbeini (bone edema in pubic bone), verkir í nára/kvið';
    expect(coerceInjuryType(t, "nári/kviður (groin/pubic region)")).toBe("groin");
  });

  it("maps Icelandic + English descriptions to the right enum", () => {
    expect(coerceInjuryType("tognun í aftanlæri", "aftanlæri")).toBe("hamstring");
    expect(coerceInjuryType("kálfaslit", "kálfi")).toBe("calf");
    expect(coerceInjuryType("fremra krossbandsslit", "hné")).toBe("knee_acl");
    expect(coerceInjuryType("liðþófaskaði", "hné")).toBe("knee_meniscus");
    expect(coerceInjuryType("verkur í hné", "hné")).toBe("knee_other");
    expect(coerceInjuryType("tognun á ökkla", "ökkli")).toBe("ankle_sprain");
    expect(coerceInjuryType("hásinabólga", "hásin")).toBe("achilles");
    expect(coerceInjuryType("mjóbaksverkur", "mjóbak")).toBe("lower_back");
    expect(coerceInjuryType("heilahristingur", "höfuð")).toBe("concussion");
    expect(coerceInjuryType("flensa", null)).toBe("illness");
    expect(coerceInjuryType("axlarmeiðsli", "öxl")).toBe("upper_body");
  });

  it("passes through values that are already valid enums", () => {
    expect(coerceInjuryType("groin")).toBe("groin");
    expect(coerceInjuryType("knee_acl")).toBe("knee_acl");
    expect(coerceInjuryType("lower back")).toBe("lower_back");
  });

  it("falls back to 'other' (never throws) for unmappable / empty input", () => {
    expect(coerceInjuryType(null)).toBe("other");
    expect(coerceInjuryType("", "")).toBe("other");
    expect(coerceInjuryType("eitthvað óskilgreint")).toBe("other");
  });

  it("only ever returns a valid enum value", () => {
    const samples = ["nára", "quadriceps strain", "ökklatognun", "xyz", "", "achilles rupture"];
    for (const s of samples) {
      expect(INJURY_TYPE_ENUM as readonly string[]).toContain(coerceInjuryType(s));
    }
  });
});

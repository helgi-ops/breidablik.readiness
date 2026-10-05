import { describe, it, expect } from "vitest";
import {
  DEFAULT_MD_MICROCYCLE,
  TACTICAL_PERIODIZATION_MORPHOCYCLE,
  specForDay,
  mdOffset,
  labelForOffset,
  modelFromStored,
  type MdDaySpec,
} from "../periodizationModel";

describe("mdOffset / labelForOffset", () => {
  it("parses signed MD labels", () => {
    expect(mdOffset("MD")).toBe(0);
    expect(mdOffset("MD-4")).toBe(-4);
    expect(mdOffset("MD+1")).toBe(1);
    expect(mdOffset("md -3")).toBe(-3); // whitespace + case tolerant
    expect(mdOffset("nonsense")).toBeNull();
    expect(mdOffset(null)).toBeNull();
  });
  it("round-trips through labelForOffset", () => {
    expect(labelForOffset(-4)).toBe("MD-4");
    expect(labelForOffset(0)).toBe("MD");
    expect(labelForOffset(1)).toBe("MD+1");
  });
});

describe("specForDay", () => {
  it("resolves a day by offset, tolerant of formatting", () => {
    const s = specForDay(DEFAULT_MD_MICROCYCLE, "MD-4");
    expect(s?.intendedType).toBe("mechanical");
    expect(specForDay(DEFAULT_MD_MICROCYCLE, "md -4")?.mdDay).toBe("MD-4");
  });
  it("returns null for a day the model doesn't define or an unparseable label", () => {
    expect(specForDay(DEFAULT_MD_MICROCYCLE, "MD-9")).toBeNull();
    expect(specForDay(DEFAULT_MD_MICROCYCLE, "xx")).toBeNull();
  });
});

describe("presets differ where it matters (why the model is selectable)", () => {
  it("default MD-2 is locomotive; Tactical Periodization MD-2 is speed", () => {
    expect(specForDay(DEFAULT_MD_MICROCYCLE, "MD-2")?.intendedType).toBe("locomotive");
    expect(specForDay(TACTICAL_PERIODIZATION_MORPHOCYCLE, "MD-2")?.intendedType).toBe("speed");
  });
  it("Tactical Periodization carries a principle tag on acquisition days; default does not", () => {
    expect(specForDay(TACTICAL_PERIODIZATION_MORPHOCYCLE, "MD-4")?.principleTag).toBeTruthy();
    expect(specForDay(DEFAULT_MD_MICROCYCLE, "MD-4")?.principleTag).toBeFalsy();
  });
  it("both keep MD-4 mechanical and MD-3 locomotive (shared microcycle spine)", () => {
    for (const m of [DEFAULT_MD_MICROCYCLE, TACTICAL_PERIODIZATION_MORPHOCYCLE]) {
      expect(specForDay(m, "MD-4")?.intendedType).toBe("mechanical");
      expect(specForDay(m, "MD-3")?.intendedType).toBe("locomotive");
    }
  });
});

describe("modelFromStored", () => {
  it("defaults to the built-in microcycle when source is missing/unknown", () => {
    expect(modelFromStored(null).source).toBe("default_md");
    expect(modelFromStored({ source: "garbage" }).source).toBe("default_md");
  });
  it("returns the Tactical Periodization preset for that source", () => {
    expect(modelFromStored({ source: "tactical_periodization" }).id).toBe("tactical_periodization");
  });
  it("round-trips a custom model's days", () => {
    const days: MdDaySpec[] = [
      { mdDay: "MD-4", intendedType: "speed", intensityCapPct: 50, note: { en: "x", is: "x" }, principleTag: "mine" },
    ];
    const m = modelFromStored({ source: "custom", days });
    expect(m.source).toBe("custom");
    expect(specForDay(m, "MD-4")?.intendedType).toBe("speed");
    expect(specForDay(m, "MD-4")?.principleTag).toBe("mine");
  });
  it("falls back to default days when a custom model is empty", () => {
    const m = modelFromStored({ source: "custom", days: [] });
    expect(m.days.length).toBe(DEFAULT_MD_MICROCYCLE.days.length);
  });
});

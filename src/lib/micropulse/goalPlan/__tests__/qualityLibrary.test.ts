import { describe, expect, it } from "vitest";
import {
  BASIS_INTRO,
  BASIS_LABEL,
  BASIS_ORDER,
  LIBRARY_QUALITIES,
  LIBRARY_SOURCE_NOTE,
  QUALITY_LIBRARIES,
  libraryRefKeys,
  libraryRefShort,
  methodsByBasis,
} from "../qualityLibrary";
import { ACCEL_METHODS } from "../acceleration";
import { BRAKING_METHODS } from "../braking";
import { JUMP_METHODS } from "../jump";
import type { Bi } from "../types";

const texts = (lib: (typeof QUALITY_LIBRARIES)[keyof typeof QUALITY_LIBRARIES]): Bi[] => [
  lib.title, lib.verdict, ...lib.facts.map((f) => f.text), ...lib.caveats,
];

describe("quality method libraries (Speed & power tab)", () => {
  it("covers acceleration, braking and jump, not top speed (that tab keeps its own library)", () => {
    expect(LIBRARY_QUALITIES).toEqual(["acceleration", "braking", "jump"]);
    for (const q of LIBRARY_QUALITIES) expect(QUALITY_LIBRARIES[q].quality).toBe(q);
  });

  it("uses the goal plans' own methods, so library and plan cannot disagree", () => {
    expect(QUALITY_LIBRARIES.acceleration.methods).toBe(ACCEL_METHODS);
    expect(QUALITY_LIBRARIES.braking.methods).toBe(BRAKING_METHODS);
    expect(QUALITY_LIBRARIES.jump.methods).toBe(JUMP_METHODS);
  });

  it("has a verdict, 2–3 sourced facts and at least one caveat per quality", () => {
    for (const q of LIBRARY_QUALITIES) {
      const lib = QUALITY_LIBRARIES[q];
      expect(lib.verdict.en.length).toBeGreaterThan(20);
      expect(lib.facts.length).toBeGreaterThanOrEqual(2);
      expect(lib.facts.length).toBeLessThanOrEqual(3);
      for (const f of lib.facts) expect(f.refs.length).toBeGreaterThan(0);
      expect(lib.caveats.length).toBeGreaterThan(0);
    }
  });

  it("every reference key resolves to a full citation", () => {
    for (const q of LIBRARY_QUALITIES) {
      const lib = QUALITY_LIBRARIES[q];
      for (const k of libraryRefKeys(lib)) {
        expect(lib.refs[k], `${q}: ${k}`).toBeDefined();
        expect(lib.refs[k].cite.length).toBeGreaterThan(20);
      }
      for (const f of lib.facts) expect(libraryRefShort(lib, f.refs).split("; ")).toHaveLength(f.refs.length);
    }
  });

  it("puts every method in exactly one basis group, tested first", () => {
    expect(BASIS_ORDER[0]).toBe("trial");
    for (const q of LIBRARY_QUALITIES) {
      const lib = QUALITY_LIBRARIES[q];
      const grouped = BASIS_ORDER.flatMap((b) => methodsByBasis(lib, b));
      expect(grouped).toHaveLength(lib.methods.length);
      expect(new Set(grouped.map((m) => m.key)).size).toBe(lib.methods.length);
    }
    for (const b of BASIS_ORDER) {
      expect(BASIS_LABEL[b].is.length).toBeGreaterThan(0);
      expect(BASIS_INTRO[b].is.length).toBeGreaterThan(0);
    }
  });

  it("never says training prevents, predicts or causes injury", () => {
    for (const q of LIBRARY_QUALITIES) {
      for (const t of texts(QUALITY_LIBRARIES[q])) {
        expect(t.en).not.toMatch(/\b(prevents?|predicts?|causes?)\b/i);
        expect(t.is).not.toMatch(/\b(kemur í veg fyrir|spáir|veldur)\b/i);
      }
    }
  });

  it("never calls a sled better than sprints", () => {
    const lib = QUALITY_LIBRARIES.acceleration;
    for (const t of texts(lib)) {
      // Any sentence comparing a sled with sprints must be a negative one ("no better", "not shown to beat").
      for (const s of t.en.split(/[.;]/)) {
        if (/sled/i.test(s) && /\b(better|beat|more effective|upgrade)\b/i.test(s)) expect(s).toMatch(/\b(no|not)\b/i);
      }
    }
    expect(lib.facts.some((f) => /no better than the same sprints without a sled/.test(f.text.en))).toBe(true);
  });

  it("shows braking's honest limit and says the text is not AI", () => {
    expect(QUALITY_LIBRARIES.braking.verdict.en).toMatch(/not yet shown/);
    expect(QUALITY_LIBRARIES.braking.facts.some((f) => f.refs.includes("marvin2024"))).toBe(true);
    expect(LIBRARY_SOURCE_NOTE.en).toMatch(/not AI/);
    expect(LIBRARY_SOURCE_NOTE.is).toMatch(/ekki gervigreind/);
  });

  it("keeps sport-science jargon out of the verdict and facts", () => {
    for (const q of LIBRARY_QUALITIES) {
      const lib = QUALITY_LIBRARIES[q];
      for (const t of [lib.verdict, ...lib.facts.map((f) => f.text)]) {
        expect(t.en).not.toMatch(/\b(ACWR|IMA|HIR|FMP|CMJ|RSI|eccentric|plyometric|effect size|SMD)\b/i);
      }
    }
  });

  it("has no Icelandic placeholders", () => {
    for (const q of LIBRARY_QUALITIES) {
      for (const t of texts(QUALITY_LIBRARIES[q])) expect(t.is).not.toMatch(/\((ur|n|a|i)\)/);
    }
  });
});

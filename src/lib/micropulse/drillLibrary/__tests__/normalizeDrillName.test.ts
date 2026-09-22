import { describe, it, expect } from "vitest";
import { normalizeDrillName } from "../normalizeDrillName";

describe("normalizeDrillName", () => {
  it("strips the '· Æf ·' date prefix", () => {
    expect(normalizeDrillName("2026-03-27 · Æf · 10v10+GK possession")).toBe("10v10+GK possession");
  });
  it("strips the 'MD-4 –' date prefix", () => {
    expect(normalizeDrillName("2026-02-03 MD-4 – Reitur")).toBe("Reitur");
  });
  it("strips an MD+1 token prefix", () => {
    expect(normalizeDrillName("2026-02-26 · MD+1 · Reitur")).toBe("Reitur");
  });
  it("leaves an already-clean name untouched", () => {
    expect(normalizeDrillName("SSG 7v7")).toBe("SSG 7v7");
  });
  it("never blanks out a name (date only → falls back to the input)", () => {
    expect(normalizeDrillName("2026-03-27")).toBe("2026-03-27");
  });
  it("is idempotent", () => {
    const x = "2026-03-27 · Æf · 10v10+GK possession";
    expect(normalizeDrillName(normalizeDrillName(x))).toBe(normalizeDrillName(x));
  });
});

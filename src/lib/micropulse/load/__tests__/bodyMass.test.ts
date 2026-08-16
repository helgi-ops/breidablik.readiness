import { describe, it, expect } from "vitest";
import { resolveBodyMass, perKg, type BodyMassMeasurement } from "../bodyMass";

describe("resolveBodyMass", () => {
  it("prefers the most recent COACH measurement over VALD", () => {
    const ms: BodyMassMeasurement[] = [
      { massKg: 78, measuredOn: "2026-07-01", source: "vald" },
      { massKg: 80, measuredOn: "2026-06-01", source: "coach" }, // older coach still wins over VALD
    ];
    const r = resolveBodyMass(ms);
    expect(r.massKg).toBe(80);
    expect(r.source).toBe("coach");
  });

  it("uses the newest coach entry when several exist", () => {
    const r = resolveBodyMass([
      { massKg: 80, measuredOn: "2026-06-01", source: "coach" },
      { massKg: 82, measuredOn: "2026-07-15", source: "coach" },
    ]);
    expect(r.massKg).toBe(82);
    expect(r.measuredOn).toBe("2026-07-15");
  });

  it("falls back to VALD when no coach entry exists", () => {
    const r = resolveBodyMass([{ massKg: 77.5, measuredOn: "2026-07-01", source: "vald" }]);
    expect(r.massKg).toBe(77.5);
    expect(r.source).toBe("vald");
    expect(r.note).toMatch(/VALD/i);
  });

  it("returns none (never a default) when nothing valid is on file", () => {
    expect(resolveBodyMass([]).source).toBe("none");
    expect(resolveBodyMass([{ massKg: 5, measuredOn: "d", source: "coach" }]).massKg).toBeNull(); // implausible → rejected
    expect(resolveBodyMass([{ massKg: null, measuredOn: "d", source: "vald" }]).massKg).toBeNull();
  });
});

describe("perKg", () => {
  it("divides by mass only when a mass is known", () => {
    const mass = resolveBodyMass([{ massKg: 80, measuredOn: "d", source: "coach" }]);
    expect(perKg(2400, mass).value).toBe(30); // e.g. 2400 N / 80 kg = 30 N/kg
    expect(perKg(2400, mass).hasMass).toBe(true);
  });
  it("returns null (not a guess) when mass is unknown", () => {
    const none = resolveBodyMass([]);
    expect(perKg(2400, none).value).toBeNull();
    expect(perKg(2400, none).hasMass).toBe(false);
  });
});

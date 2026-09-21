import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { scoreVolumeIntensity, readTaperShape, type SessionLoadInputs } from "../volumeIntensityScore";

// Reference: volumeRef 500 PL, intensityRef 8 PL/min → each maps to 50.
const REF = { volumeRef: 500, intensityRef: 8 };

describe("scoreVolumeIntensity — quadrants", () => {
  it("high total distance + low per-min → high_vol_low_int (MD-4-type)", () => {
    // PlayerLoad absent → volume anchors on totalDistanceM; ref must match that anchor.
    const inp: SessionLoadInputs = { totalDistanceM: 7000, distancePerMin: 60 };
    const s = scoreVolumeIntensity(inp, { volumeRef: 5000, intensityRef: 110 });
    expect(s.volume).toBeGreaterThanOrEqual(50);
    expect(s.intensity).toBeLessThan(50);
    expect(s.quadrant).toBe("high_vol_low_int");
    expect(s.note.en).toMatch(/MD-4/);
  });

  it("low volume + low intensity → low_vol_low_int (a taper)", () => {
    const s = scoreVolumeIntensity({ playerLoad: 200, playerLoadPerMin: 4 }, REF);
    expect(s.quadrant).toBe("low_vol_low_int");
    expect(s.note.en).toMatch(/taper/i);
  });

  it("high both → high_vol_high_int", () => {
    const s = scoreVolumeIntensity({ playerLoad: 700, playerLoadPerMin: 11 }, REF);
    expect(s.quadrant).toBe("high_vol_high_int");
  });
});

describe("null-safety", () => {
  it("missing intensity inputs → intensity null, quadrant unknown", () => {
    const s = scoreVolumeIntensity({ playerLoad: 600 }, REF);
    expect(s.volume).not.toBeNull();
    expect(s.intensity).toBeNull();
    expect(s.quadrant).toBe("unknown");
  });
  it("no reference → both null, unknown (never fabricated)", () => {
    const s = scoreVolumeIntensity({ playerLoad: 600, playerLoadPerMin: 10 }, null);
    expect(s.volume).toBeNull();
    expect(s.intensity).toBeNull();
    expect(s.quadrant).toBe("unknown");
  });
  it("reference of 0 is treated as missing, not a divide-by-zero", () => {
    const s = scoreVolumeIntensity({ playerLoad: 600, playerLoadPerMin: 10 }, { volumeRef: 0, intensityRef: 8 });
    expect(s.volume).toBeNull();
    expect(s.intensity).not.toBeNull();
  });
});

describe("vsMdExpectation uses the MD-day band", () => {
  it("an MD-1 session well above its expected volume → above", () => {
    // volume ≈ round(900/500*50)=90; expected MD-1 volume 30 → above
    const s = scoreVolumeIntensity({ playerLoad: 900, playerLoadPerMin: 5 }, REF, "MD-1", 30);
    expect(s.volume).toBe(90);
    expect(s.vsMdExpectation).toBe("above");
  });
  it("in-band → as_expected; well below → below", () => {
    expect(scoreVolumeIntensity({ playerLoad: 300, playerLoadPerMin: 4 }, REF, "MD-1", 30).vsMdExpectation).toBe("as_expected"); // vol 30
    expect(scoreVolumeIntensity({ playerLoad: 50, playerLoadPerMin: 4 }, REF, "MD-1", 60).vsMdExpectation).toBe("below"); // vol 5
  });
  it("no expectation given → unknown", () => {
    expect(scoreVolumeIntensity({ playerLoad: 600, playerLoadPerMin: 10 }, REF).vsMdExpectation).toBe("unknown");
  });
});

describe("readTaperShape", () => {
  const pt = (mdDay: string, volume: number | null, intensity: number | null) => ({
    mdDay, date: "2026-09-20",
    score: { volume, intensity, quadrant: "unknown" as const, vsMdExpectation: "unknown" as const, note: { en: "", is: "" } },
  });
  it("MD-1 low-low → tapered", () => {
    const r = readTaperShape([pt("MD-4", 80, 40), pt("MD-1", 25, 20)]);
    expect(r.tapered).toBe(true);
    expect(r.note.en).toMatch(/proper taper/i);
  });
  it("MD-1 still mid-intensity → not tapered", () => {
    const r = readTaperShape([pt("MD-1", 20, 65)]);
    expect(r.tapered).toBe(false);
    expect(r.note.en).toMatch(/under-tapered/i);
  });
  it("no MD-1 → null", () => {
    expect(readTaperShape([pt("MD-3", 60, 60)]).tapered).toBeNull();
  });
});

describe("boundary — never reaches readiness / decision / load-target modules", () => {
  it("volumeIntensityScore.ts imports nothing from those engines", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../volumeIntensityScore.ts"), "utf8");
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const forbidden of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "decision", "loadTarget"]) {
      expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
    }
  });
});

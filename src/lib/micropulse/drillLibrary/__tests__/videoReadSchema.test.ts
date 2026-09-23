import { describe, it, expect } from "vitest";
import { normalizeDrillVideoRead, FORBIDDEN_METRIC_KEYS, VIDEO_READ_CATEGORIES } from "../videoReadSchema";

describe("normalizeDrillVideoRead", () => {
  it("maps a well-formed read", () => {
    const r = normalizeDrillVideoRead({
      suggestedName: "6v3 possession + finish", category: "possession", format: "6v3",
      playersEst: 9, areaType: "small", phases: ["possession in grid", "transition", "finish on goal"],
      equipment: ["mini-goals", "mannequin", "cones"], description: { en: "Small-sided, high tempo.", is: "Smáleikur, hátt tempó." },
      intensityEst: "high", confidence: "moderate", caveat: { en: "confirm", is: "staðfestu" },
    }, 5);
    expect(r.suggestedName).toBe("6v3 possession + finish");
    expect(r.category).toBe("possession");
    expect(r.format).toBe("6v3");
    expect(r.playersEst).toBe(9);
    expect(r.phases.length).toBe(3);
    expect(r.intensityEst).toBe("high");
  });

  it("clamps an unknown category to 'other' and bad enums to null", () => {
    const r = normalizeDrillVideoRead({ suggestedName: "x", category: "rondo", areaType: "huge", intensityEst: "extreme" }, 5);
    expect(r.category).toBe("other");
    expect(r.areaType).toBeNull();
    expect(r.intensityEst).toBeNull();
  });

  it("NEVER carries a physical metric or player identity, even if the model emits them", () => {
    const r = normalizeDrillVideoRead({
      suggestedName: "x", category: "ssg",
      // the model tried to invent forbidden fields:
      player_load: 500, vel_b5: 120, accel_b23: 40, distance_m: 900, playerName: "Aron", speed: 30,
    }, 6) as unknown as Record<string, unknown>;
    for (const k of FORBIDDEN_METRIC_KEYS) expect(k in r).toBe(false);
  });

  it("defaults confidence to moderate and builds a frame-count caveat", () => {
    const r = normalizeDrillVideoRead({ suggestedName: "x", category: "ssg" }, 7);
    expect(r.confidence).toBe("moderate");
    expect(r.caveat.en).toMatch(/7 video frames/);
    expect(r.caveat.en).toMatch(/GPS/);
  });

  it("playersEst rejects non-numbers; phases/equipment ignore non-strings", () => {
    const r = normalizeDrillVideoRead({ suggestedName: "x", category: "ssg", playersEst: "lots", phases: ["a", 3, null, "b"], equipment: "cones" }, 5);
    expect(r.playersEst).toBeNull();
    expect(r.phases).toEqual(["a", "b"]);
    expect(r.equipment).toEqual([]);
  });

  it("category enum is the football subset", () => {
    expect(VIDEO_READ_CATEGORIES).toContain("possession");
    expect(VIDEO_READ_CATEGORIES).toContain("ssg");
    expect(VIDEO_READ_CATEGORIES).not.toContain("shooting"); // basketball not offered by the video read
  });
});

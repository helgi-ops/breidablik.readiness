import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildSpeedZones, classifyBandsToZones, matchHsrVsCapacity } from "../speedZones";

describe("buildSpeedZones", () => {
  it("MAS 16 / MSS 32 → asr 16, HSR floor 16.0, sprint floor 20.8; high with vameval + sprint_test", () => {
    const z = buildSpeedZones({ masKmh: 16, masSource: "vameval", mssKmh: 32, mssSource: "sprint_test" })!;
    expect(z).not.toBeNull();
    expect(z.asrKmh).toBe(16);
    expect(z.hsrFloorKmh).toBe(16.0);
    expect(z.sprintFloorKmh).toBe(20.8); // 16 + 0.30·16
    expect(z.hsrFloorMPerMin).toBe(Math.round(16 / 0.06));
    expect(z.sprintFloorMPerMin).toBe(Math.round(20.8 / 0.06));
    expect(z.confidence).toBe("high");
  });

  it("sprintPctAsr override 0.50 → sprint floor 24.0", () => {
    const z = buildSpeedZones({ masKmh: 16, masSource: "vameval", mssKmh: 32, mssSource: "sprint_test", sprintPctAsr: 0.5 })!;
    expect(z.sprintFloorKmh).toBe(24.0); // 16 + 0.50·16
    expect(z.sprintPctAsr).toBe(0.5);
  });

  it("returns null when MSS ≤ MAS", () => {
    expect(buildSpeedZones({ masKmh: 20, masSource: "vameval", mssKmh: 19, mssSource: "sprint_test" })).toBeNull();
    expect(buildSpeedZones({ masKmh: 20, masSource: "vameval", mssKmh: 20, mssSource: "sprint_test" })).toBeNull();
    expect(buildSpeedZones({ masKmh: null, masSource: "vameval", mssKmh: 30, mssSource: "sprint_test" })).toBeNull();
  });

  it("confidence low when MAS is VIFT-shrunk, or MSS is a single-session GPS max", () => {
    // proxy MAS → low regardless of a measured MSS
    const viftShrunk = buildSpeedZones({ masKmh: 16, masSource: "vift_shrunk", mssKmh: 32, mssSource: "sprint_test" })!;
    expect(viftShrunk.confidence).toBe("low");
    // GPS season-max with no proven exposure → single-session risk → low
    const gpsSingle = buildSpeedZones({ masKmh: 16, masSource: "vameval", mssKmh: 32, mssSource: "gps_season_max" })!;
    expect(gpsSingle.confidence).toBe("low");
    // …but a well-exposed GPS max with a direct MAS earns high
    const gpsExposed = buildSpeedZones({ masKmh: 16, masSource: "msft", mssKmh: 32, mssSource: "gps_season_max", mssSessions: 8 })!;
    expect(gpsExposed.confidence).toBe("high");
  });
});

describe("classifyBandsToZones", () => {
  // MAS 16 / MSS 32 → HSR floor 16.0, sprint floor 20.8.
  const zones = buildSpeedZones({ masKmh: 16, masSource: "vameval", mssKmh: 32, mssSource: "sprint_test" })!;

  it("only counts a band whose lower edge clears the floor; a band ≥ sprint floor counts to both", () => {
    const res = classifyBandsToZones(
      [
        { lowerEdgeKmh: 14.4, distanceM: 500 }, // below HSR floor 16.0 → contributes 0
        { lowerEdgeKmh: 19.8, distanceM: 300 }, // ≥ HSR floor, < sprint floor 20.8 → HSR only
        { lowerEdgeKmh: 25.2, distanceM: 120 }, // ≥ sprint floor → HSR and sprint
      ],
      zones,
    );
    expect(res.individualisedHsrM).toBe(420); // 300 + 120 (the 14.4 band excluded)
    expect(res.individualisedSprintM).toBe(120); // only the 25.2 band
    expect(res.note.en).toMatch(/lower edge|conservative/i);
  });
});

describe("matchHsrVsCapacity", () => {
  it("300 / 400 → 75 %", () => {
    expect(matchHsrVsCapacity({ matchHsrM: 300, seasonBestHsrM: 400 }).pct).toBe(75);
  });
  it("null season best → null", () => {
    expect(matchHsrVsCapacity({ matchHsrM: 300, seasonBestHsrM: null }).pct).toBeNull();
    expect(matchHsrVsCapacity({ matchHsrM: null, seasonBestHsrM: 400 }).pct).toBeNull();
    expect(matchHsrVsCapacity({ matchHsrM: 300, seasonBestHsrM: 0 }).pct).toBeNull();
  });
});

describe("boundary — descriptive only, no readiness/decision coupling", () => {
  it("speedZones.ts imports nothing from a readiness/decision module", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../speedZones.ts"), "utf8");
    // Mirror the criticalSpeed descriptive-only boundary: the pure zone lib must not reach any
    // readiness/decision code path. It should import only ./peakPeriod (types) and ./criticalSpeed.
    const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["./criticalSpeed", "./peakPeriod"]);
    // No import path may reach a readiness/decision module (prose in the caveat may mention the
    // "daily decision" as the thing it must NOT touch — that's the point, so scan imports only).
    for (const forbidden of ["readiness", "decision", "stage4", "resolveFinalState", "athlete_decision", "athleteState"]) {
      expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
    }
  });
});

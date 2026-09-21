import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildPositionFitnessRequirements, MEETS_PCTL } from "../positionFitnessRequirements";
import type { QualityId, QualityRead, AthleteProfile } from "@/lib/micropulse/playerAnalysis/athleteProfile";

function q(id: QualityId, pctl: number | null, opts: { benchmark?: "position" | "squad"; value?: number; unit?: string } = {}): QualityRead {
  return {
    id, value: opts.value ?? null, unit: opts.unit ?? "", source: "test", date: "2026-09-01", sampleSize: 5,
    positionPercentile: pctl, squadPercentile: pctl, benchmark: opts.benchmark ?? "position",
    poolSize: opts.benchmark === "squad" ? 3 : 6, verdict: "neutral", confidence: "moderate", trend: null,
  };
}
function profile(quals: QualityRead[]): AthleteProfile {
  return {
    playerId: "p1", position: "RB", positionGroup: "WDP", qualities: quals, strengths: [], weaknesses: [],
    coverage: { sources: ["test"], qualitiesWithData: quals.filter((x) => x.value != null || x.positionPercentile != null).length, totalQualities: quals.length, ratio: 1 },
  };
}

describe("buildPositionFitnessRequirements", () => {
  it("FB: MSS/ASR percentiles ≥ 40 and aerobic 30 → meets 2/3, below on aerobic engine", () => {
    const r = buildPositionFitnessRequirements({
      playerId: "p1", name: "Aron", position: "RB", // RB → WDP (full-back)
      profile: profile([
        q("speed", 50), q("anaerobic_reserve", 45), q("aerobic_endurance", 30),
      ]),
      fitnessValues: { aerobic_endurance: { value: 15.0, unit: "km/h" }, speed: { value: 33, unit: "km/h" } },
    });
    expect(r.scored).toBe(true);
    expect(r.total).toBe(3);        // only the 3 covered demanded qualities count
    expect(r.metCount).toBe(2);
    expect(r.verdict.en).toMatch(/2\/3/);
    expect(r.verdict.en).toMatch(/below on aerobic endurance/i);
    // demand-weighted order: aerobic_endurance (1.0) is the top demanded quality for a full-back
    expect(r.rows[0].quality).toBe("aerobic_endurance");
    expect(r.rows.find((x) => x.quality === "aerobic_endurance")!.band).toBe("below");
    expect(r.rows.find((x) => x.quality === "speed")!.band).toBe("meets");
  });

  it("MEETS_PCTL boundary: 40 → meets, 39 → below", () => {
    const at = buildPositionFitnessRequirements({ playerId: "p1", name: "x", position: "RB",
      profile: profile([q("speed", MEETS_PCTL)]), fitnessValues: {} });
    expect(at.rows.find((x) => x.quality === "speed")!.band).toBe("meets");
    expect(at.rows.find((x) => x.quality === "speed")!.gapToMeetPctl).toBe(0);

    const below = buildPositionFitnessRequirements({ playerId: "p1", name: "x", position: "RB",
      profile: profile([q("speed", MEETS_PCTL - 1)]), fitnessValues: {} });
    const row = below.rows.find((x) => x.quality === "speed")!;
    expect(row.band).toBe("below");
    expect(row.gapToMeetPctl).toBe(1);
  });

  it("elite gap: MSS 31.0 vs FB elite 33.5 → gapToElite 2.5, provisional", () => {
    const r = buildPositionFitnessRequirements({ playerId: "p1", name: "x", position: "RB",
      profile: profile([q("speed", 55)]),
      fitnessValues: { speed: { value: 31.0, unit: "km/h" } } });
    const row = r.rows.find((x) => x.quality === "speed")!;
    expect(row.eliteRef).toBe(33.5);
    expect(row.eliteProvisional).toBe(true);
    expect(row.gapToElite).toBe(2.5);
    expect(row.playerValue).toBe(31.0);
  });

  it("small pool → rows use the squad benchmark and confidence is not high", () => {
    const r = buildPositionFitnessRequirements({ playerId: "p1", name: "x", position: "RB",
      profile: profile([q("speed", 60, { benchmark: "squad" }), q("aerobic_endurance", 55, { benchmark: "squad" })]),
      fitnessValues: { aerobic_endurance: { value: 16, unit: "km/h" }, speed: { value: 33, unit: "km/h" } } });
    expect(r.rows.every((x) => x.band === "unknown" || x.benchmark === "squad")).toBe(true);
    expect(r.confidence).not.toBe("high");
    expect(r.confidence).toBe("low");
  });

  it("GK / basketball → scored:false with an honest verdict", () => {
    const gk = buildPositionFitnessRequirements({ playerId: "p1", name: "Keeper", position: "GK", profile: profile([]), fitnessValues: {} });
    expect(gk.scored).toBe(false);
    expect(gk.juGroup).toBeNull();
    expect(gk.verdict.en).toMatch(/no outfield/i);

    const bball = buildPositionFitnessRequirements({ playerId: "p1", name: "Hooper", position: "PG", sport: "basketball", profile: profile([]), fitnessValues: {} });
    expect(bball.scored).toBe(false);
  });

  it("confidence is high with a position pool + MAS & MSS present", () => {
    const r = buildPositionFitnessRequirements({ playerId: "p1", name: "x", position: "RB",
      profile: profile([q("speed", 60), q("aerobic_endurance", 55), q("anaerobic_reserve", 50)]),
      fitnessValues: { aerobic_endurance: { value: 16.5, unit: "km/h" }, speed: { value: 33, unit: "km/h" }, anaerobic_reserve: { value: 16.5, unit: "km/h" } } });
    expect(r.confidence).toBe("high");
  });

  describe("boundary — descriptive only, no readiness/decision coupling", () => {
    it("imports nothing from a readiness/decision module", () => {
      const here = dirname(fileURLToPath(import.meta.url));
      const src = readFileSync(resolve(here, "../positionFitnessRequirements.ts"), "utf8");
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const forbidden of ["readiness", "decision", "stage4", "resolveFinalState", "athlete_decision", "athleteState"]) {
        expect(imports.some((p) => p.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
      }
    });
  });
});

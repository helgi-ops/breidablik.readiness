import { describe, it, expect } from "vitest";
import { exposureToDemand, aggregateGapDrills, type PlayerGapRecs } from "../gapDrills";
import type { DrillRec, DrillPick } from "@/lib/micropulse/footballDrills/recommend";

describe("exposureToDemand", () => {
  it("maps under-exposure to a gap-tripping z (90%→-0.5, 80%→-1)", () => {
    expect(exposureToDemand("sprint", 1000, 900)!.z).toBeCloseTo(-0.5, 5);
    expect(exposureToDemand("decel", 1000, 800)!.z).toBeCloseTo(-1, 5);
  });
  it("at/above match demand → non-gap z; carries matchMean as value", () => {
    const d = exposureToDemand("accel", 1000, 1000)!;
    expect(d.z).toBe(0);       // pct 100 → z 0, not a gap
    expect(d.value).toBe(1000);
    expect(exposureToDemand("sprint", 1000, 1400)!.z).toBe(2); // clamped at +2
  });
  it("clamps very low exposure and returns null with no match reference", () => {
    expect(exposureToDemand("sprint", 1000, 0)!.z).toBe(-2); // pct 0 → clamp -2
    expect(exposureToDemand("sprint", 0, 500)).toBeNull();
    expect(exposureToDemand("sprint", -5, 500)).toBeNull();
  });
});

const pick = (id: string, name = id): DrillPick => ({
  id, name, category: "ssg", format: null, players: 8, duration_min: 12, pitch: null,
  qualityValue: 100, unit: "m", playerLoadPerMin: null, diagram_url: null,
});
const rec = (quality: DrillRec["quality"], kind: DrillRec["kind"], drills: DrillPick[]): DrillRec => ({
  kind, quality, label: { en: quality, is: quality }, why: { en: "", is: "" }, drills,
});

describe("aggregateGapDrills", () => {
  it("ranks drills by how many players' gaps they close; dedupes by id; keeps qualities", () => {
    const players: PlayerGapRecs[] = [
      { playerId: "1", name: "Arnór", recs: [rec("sprint", "gap", [pick("d1"), pick("d2")])] },
      { playerId: "2", name: "Gabríel", recs: [rec("sprint", "gap", [pick("d1")]), rec("decel", "gap", [pick("d3")])] },
      { playerId: "3", name: "Jón", recs: [rec("decel", "gap", [pick("d1")])] }, // d1 also for decel
    ];
    const out = aggregateGapDrills(players);
    expect(out[0].id).toBe("d1");          // covers 3 players → ranked first
    expect(out[0].coverage).toBe(3);
    expect(out[0].players.sort()).toEqual(["Arnór", "Gabríel", "Jón"]);
    expect(out[0].qualities.sort()).toEqual(["decel", "sprint"]);
    expect(out.map((d) => d.id)).toContain("d2");
    expect(out.map((d) => d.id)).toContain("d3");
  });

  it("ignores strength recs (only gaps) and handles empty input", () => {
    const players: PlayerGapRecs[] = [{ playerId: "1", name: "A", recs: [rec("sprint", "strength", [pick("s1")])] }];
    expect(aggregateGapDrills(players)).toEqual([]);
    expect(aggregateGapDrills([])).toEqual([]);
  });
});

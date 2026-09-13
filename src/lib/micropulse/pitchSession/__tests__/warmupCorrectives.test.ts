import { describe, it, expect } from "vitest";
import { aggregateWarmupCorrectives, type PlayerCorrectives } from "../warmupCorrectives";
import type { SessionCorrective } from "@/lib/micropulse/strengthProgramming/types";

const c = (slug: string): SessionCorrective => ({
  slug, nameEN: slug, nameIS: slug, doseEN: "2×10", doseIS: "2×10", cueEN: "cue", cueIS: "cue",
  sourceNoteEN: "screen", sourceNoteIS: "skimun",
});

const p = (playerId: string, name: string, slugs: string[]): PlayerCorrectives => ({
  playerId, name, correctives: slugs.map(c),
});

describe("aggregateWarmupCorrectives", () => {
  it("splits team-common (shared by ≥2 players) from individual", () => {
    const out = aggregateWarmupCorrectives([
      p("1", "Arnór", ["hip_activation", "ankle_mobility"]),
      p("2", "Gabríel", ["hip_activation"]),
      p("3", "Jón", ["nordic_curl"]),
    ]);
    // hip_activation shared by 2 → team-common; others individual.
    expect(out.teamCommon.map((t) => t.slug)).toEqual(["hip_activation"]);
    expect(out.teamCommon[0].count).toBe(2);
    expect(out.teamCommon[0].playerNames.sort()).toEqual(["Arnór", "Gabríel"]);
    // Arnór keeps only his non-common corrective; Jón keeps his; Gabríel drops out (only common).
    const byName = new Map(out.individual.map((i) => [i.name, i.correctives.map((x) => x.slug)]));
    expect(byName.get("Arnór")).toEqual(["ankle_mobility"]);
    expect(byName.get("Jón")).toEqual(["nordic_curl"]);
    expect(byName.has("Gabríel")).toBe(false);
  });

  it("dedupes a corrective repeated within one player (counts once)", () => {
    const out = aggregateWarmupCorrectives([
      { playerId: "1", name: "A", correctives: [c("x"), c("x")] },
      p("2", "B", ["x"]),
    ]);
    expect(out.teamCommon[0].count).toBe(2); // A counted once + B
  });

  it("respects a custom minShared threshold", () => {
    const out = aggregateWarmupCorrectives(
      [p("1", "A", ["x"]), p("2", "B", ["x"]), p("3", "C", ["x"])],
      { minShared: 3 },
    );
    expect(out.teamCommon.map((t) => t.slug)).toEqual(["x"]);
    const out2 = aggregateWarmupCorrectives([p("1", "A", ["x"]), p("2", "B", ["x"])], { minShared: 3 });
    expect(out2.teamCommon).toEqual([]); // only 2 share → not common at threshold 3
    expect(out2.individual.length).toBe(2);
  });

  it("empty input → empty aggregation", () => {
    expect(aggregateWarmupCorrectives([])).toEqual({ teamCommon: [], individual: [] });
  });
});

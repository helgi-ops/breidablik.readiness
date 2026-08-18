import { describe, it, expect } from "vitest";
import { mergeStatsbombSiblingRows, type SiblingRow } from "../mergeSeasonSiblings";

// The Squad export: deep numbers, stable SBD id, NO position.
const squad: SiblingRow = {
  id: "squad-row", source_player_ref: "sb:409242", player_id: null,
  minutes: 1718, goals: 2, assists: 0, xg: 0.12,
  metrics: { "OBV": 0.11, "Deep Progressions": 2.2, "Ball Receipts in Space 10m%": 33, unit: "per90" },
};
// The Player-Stats export: shallower, name ref, HAS Primary Position + a mapped player.
const playerStats: SiblingRow = {
  id: "pstats-row", source_player_ref: "sbname:sigurjonrunarsson", player_id: "player-uuid",
  minutes: 1718, goals: 2, assists: 0, xg: 0.12,
  metrics: { "OBV": 0.11, "Primary Position": "Centre Back", "Tackles": 0.68 },
};

describe("mergeStatsbombSiblingRows", () => {
  it("returns null when there is nothing to collapse (0 or 1 row)", () => {
    expect(mergeStatsbombSiblingRows([])).toBeNull();
    expect(mergeStatsbombSiblingRows([squad])).toBeNull();
  });

  it("keeps the Squad row (stable SBD id) as canonical and grafts on Primary Position", () => {
    const plan = mergeStatsbombSiblingRows([playerStats, squad])!;
    expect(plan).not.toBeNull();
    expect(plan.canonicalId).toBe("squad-row"); // sb:<id> wins regardless of order
    expect(plan.staleIds).toEqual(["pstats-row"]);
    // Squad-only depth survives…
    expect(plan.update.metrics["Ball Receipts in Space 10m%"]).toBe(33);
    // …AND the Player-Stats position is grafted in…
    expect(plan.update.metrics["Primary Position"]).toBe("Centre Back");
    // …AND a Player-Stats-only metric is unioned in.
    expect(plan.update.metrics["Tackles"]).toBe(0.68);
  });

  it("canonical's own non-empty value wins on conflict (never overwritten)", () => {
    const squadHi: SiblingRow = { ...squad, metrics: { ...squad.metrics, "OBV": 0.45 } };
    const plan = mergeStatsbombSiblingRows([squadHi, playerStats])!;
    expect(plan.update.metrics["OBV"]).toBe(0.45); // Squad's precise value, not Player-Stats' 0.11
  });

  it("gap-fills player_id from whichever sibling carries it", () => {
    const plan = mergeStatsbombSiblingRows([squad, playerStats])!;
    expect(plan.update.player_id).toBe("player-uuid"); // Squad had none → filled from Player-Stats
  });

  it("falls back to the first row as canonical when neither has an sb: id", () => {
    const a: SiblingRow = { ...playerStats, id: "a", source_player_ref: "sbname:a" };
    const b: SiblingRow = { ...playerStats, id: "b", source_player_ref: "sbname:b", metrics: { "Pressures": 7.18 } };
    const plan = mergeStatsbombSiblingRows([a, b])!;
    expect(plan.canonicalId).toBe("a");
    expect(plan.update.metrics["Primary Position"]).toBe("Centre Back");
    expect(plan.update.metrics["Pressures"]).toBe(7.18); // unioned from b
  });
});

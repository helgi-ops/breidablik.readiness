import { describe, it, expect } from "vitest";
import { wcsTacticalDrillCategories, drillMatchesTactical } from "../wcsTactical";
import type { ActionShare } from "@/lib/micropulse/peakPeriodContext";
import { ACTION_LABEL } from "@/lib/micropulse/peakPeriodContext";

const share = (action: ActionShare["action"], count: number, offBall: boolean): ActionShare =>
  ({ action, label: ACTION_LABEL[action], count, share: count, obv: null, offBall });

describe("wcsTacticalDrillCategories", () => {
  it("run_in_behind → penetration/breakaway drills (finishing/running)", () => {
    const r = wcsTacticalDrillCategories([share("run_in_behind", 5, false), share("support_play", 1, false)]);
    expect(r.dominant).toBe("run_in_behind");
    expect(r.categories).toEqual(["finishing", "running"]);
    expect(r.offBall).toBe(false);
  });

  it("support_play → possession/ssg", () => {
    const r = wcsTacticalDrillCategories([share("support_play", 4, false)]);
    expect(r.categories).toEqual(["possession", "ssg"]);
  });

  it("prefers the dominant ON-BALL action over a busier off-ball one, then downgrades off-ball if that is all", () => {
    // recovery_run (off-ball) busiest, but move_to_receive is on-ball → on-ball wins
    const r = wcsTacticalDrillCategories([share("recovery_run", 6, true), share("move_to_receive", 3, false)]);
    expect(r.dominant).toBe("move_to_receive");
    expect(r.offBall).toBe(false);
  });

  it("off-ball dominant (only off-ball present) → needs-tracking note + low confidence", () => {
    const r = wcsTacticalDrillCategories([share("recovery_run", 6, true)]);
    expect(r.offBall).toBe(true);
    expect(r.confidence).toBe("low");
    expect(r.note.en).toMatch(/tracking/i);
    expect(r.categories).toEqual(["transition"]);
  });

  it("no meaningful events → low confidence, physical-only note", () => {
    const r = wcsTacticalDrillCategories([share("other", 5, false)]);
    expect(r.dominant).toBeNull();
    expect(r.confidence).toBe("low");
    expect(r.categories).toEqual([]);
  });
});

describe("drillMatchesTactical", () => {
  it("matches by case-insensitive substring; empty preference = no filter", () => {
    expect(drillMatchesTactical("Possession", ["possession", "ssg"])).toBe(true);
    expect(drillMatchesTactical("finishing", ["possession"])).toBe(false);
    expect(drillMatchesTactical(null, [])).toBe(true);
  });
});

// Boundary: the recommender layer must never reach the readiness colour / daily decision.
describe("purity boundary", () => {
  it("neither WCS lib imports readiness / decision / load-target engines", async () => {
    const fs = await import("node:fs");
    for (const f of ["wcsDrillMatch.ts", "wcsTactical.ts"]) {
      const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
      const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
      for (const bad of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "loadTarget"]) {
        expect(imports.includes(bad)).toBe(false);
      }
    }
  });
});

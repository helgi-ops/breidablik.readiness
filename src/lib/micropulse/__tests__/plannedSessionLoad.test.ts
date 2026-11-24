/**
 * Week shape: load falls toward the match, so MD-4 is the heaviest training day and MD-3 a step below
 * (Martín-García 2018: MD-4 > MD-3 > MD-2 > MD-1). The coach chose MD-4 over the report's MD-3 peak on
 * 2026-11-24.
 */
import { describe, expect, it } from "vitest";
import { planSessionLoad } from "../plannedSessionLoad";

const day = (mdDay: string) => planSessionLoad({ mdDay, dayType: "TRAINING", focus: null });

describe("planSessionLoad week shape", () => {
  it("MD-4 > MD-3 > MD-2 > MD-1 in share of match load and in session load", () => {
    const [d4, d3, d2, d1] = ["MD-4", "MD-3", "MD-2", "MD-1"].map(day);
    expect(d4.matchPct).toBeGreaterThan(d3.matchPct);
    expect(d3.matchPct).toBeGreaterThan(d2.matchPct);
    expect(d2.matchPct).toBeGreaterThan(d1.matchPct);
    expect(d4.sessionLoad).toBeGreaterThan(d3.sessionLoad);
    expect(d4.band).toBe("very_high");
  });

  it("keeps the load types: MD-4 mechanical, MD-3 locomotive", () => {
    expect(day("MD-4").loadType).toBe("mechanical");
    expect(day("MD-3").loadType).toBe("locomotive");
  });
});

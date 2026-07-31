import { describe, it, expect } from "vitest";
import {
  pickPlayerStats,
  seasonHeadline,
  statIdsForPosition,
  sportPositionFamily,
  sportProfileMetricKeys,
  type SportStatInput,
} from "../index";

const FOOTBALL: SportStatInput = {
  core: { minutes: 1659, goals: 7, assists: 6, xg: 4, passAccuracyPct: 79 },
  metrics: { "Matches played": 18, "xA per 90": 0.2, "Successful dribbles, %": 60 },
};
const BASKETBALL: SportStatInput = {
  core: { minutes: 540 },
  metrics: { "Games": 18, "Points per game": 14.2, "Rebounds per game": 3.1, "Assists per game": 5.6, "Field goals %": 45, "Three-point %": 37 },
};

describe("pickPlayerStats dispatch", () => {
  it("routes football to the football catalog", () => {
    const ids = pickPlayerStats("football", FOOTBALL, "RW", "EN").map((s) => s.id);
    expect(ids.slice(0, 6)).toEqual(["matches", "minutes", "goals", "assists", "xg", "passAcc"]);
    expect(ids).toContain("dribbleSucc");
  });

  it("routes basketball to the basketball catalog", () => {
    const ids = pickPlayerStats("basketball", BASKETBALL, "PG", "EN").map((s) => s.id);
    expect(ids.slice(0, 6)).toEqual(["games", "minutes", "points", "rebounds", "assists", "fgPct"]);
    expect(ids).toContain("astTo");
  });

  it("defaults unknown/blank sport to football (safe default)", () => {
    const ids = pickPlayerStats(null, FOOTBALL, "CF", "EN").map((s) => s.id);
    expect(ids).toContain("goals");
    expect(ids).not.toContain("points");
  });
});

describe("seasonHeadline dispatch", () => {
  it("uses the sport's headline shape", () => {
    expect(seasonHeadline("football", FOOTBALL, "RW", "EN").secondary).toBe("7 goals · 6 assists");
    expect(seasonHeadline("basketball", BASKETBALL, "PG", "EN").secondary).toBe("14.2 pts · 3.1 reb · 5.6 ast");
  });
});

describe("statIdsForPosition + sportPositionFamily dispatch", () => {
  it("returns the sport-specific taxonomy", () => {
    expect(sportPositionFamily("football", "RW")).toBe("WING");
    expect(sportPositionFamily("basketball", "C")).toBe("BIG");
    expect(statIdsForPosition("basketball", "C")).toContain("blocks");
    expect(statIdsForPosition("football", "CB")).toContain("aerialWon");
  });
});

describe("sportProfileMetricKeys dispatch", () => {
  it("returns the sport's profile-key set", () => {
    expect(sportProfileMetricKeys("football").has("Market value")).toBe(true);
    expect(sportProfileMetricKeys("basketball").has("Height")).toBe(true);
    expect(sportProfileMetricKeys("basketball").has("Market value")).toBe(false);
  });
});

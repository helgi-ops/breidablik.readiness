import { describe, it, expect } from "vitest";
import { currentBasketballSeasonLabel, seasonStartYear, latestSeason } from "../season";

describe("currentBasketballSeasonLabel", () => {
  it("Aug–Dec belongs to the season starting that year", () => {
    expect(currentBasketballSeasonLabel(new Date("2026-10-23T12:00:00Z"))).toBe("2026-27");
    expect(currentBasketballSeasonLabel(new Date("2026-08-01T12:00:00Z"))).toBe("2026-27");
  });
  it("Jan–Jul belongs to the season that started last August", () => {
    expect(currentBasketballSeasonLabel(new Date("2027-05-17T12:00:00Z"))).toBe("2026-27");
    expect(currentBasketballSeasonLabel(new Date("2026-01-09T12:00:00Z"))).toBe("2025-26");
  });
  it("pads the two-digit end year across a century turn", () => {
    expect(currentBasketballSeasonLabel(new Date("2099-09-01T12:00:00Z"))).toBe("2099-00");
  });
});

describe("seasonStartYear", () => {
  it("parses the leading year of a season label", () => {
    expect(seasonStartYear("2026-27")).toBe(2026);
    expect(seasonStartYear("2025-2026")).toBe(2025);
  });
  it("rejects non-season labels (bare ids, null)", () => {
    expect(seasonStartYear("132570")).toBeNull();
    expect(seasonStartYear(null)).toBeNull();
    expect(seasonStartYear("")).toBeNull();
  });
});

describe("latestSeason", () => {
  it("picks the newest season label by start year", () => {
    expect(latestSeason(["2025-26", "2026-27", "2024-25"])).toBe("2026-27");
  });
  it("ignores bare numeric ids and nulls", () => {
    expect(latestSeason(["2025-26", "132570", null, "2026-27"])).toBe("2026-27");
  });
  it("returns null when nothing is season-shaped", () => {
    expect(latestSeason(["132570", null])).toBeNull();
  });
});

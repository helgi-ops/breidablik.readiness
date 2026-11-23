/**
 * Congested week (congestion.ts, contradiction 8): two matches in 7 days with today in them; upcoming fixtures always
 * count, a past match only when the player played ≥ 60 min.
 */
import { describe, expect, it } from "vitest";
import { isCongestedWeek } from "../congestion";

const TODAY = "2026-11-23"; // Monday

describe("isCongestedWeek", () => {
  it("two upcoming fixtures 3 days apart → congested", () => {
    expect(isCongestedWeek(["2026-11-25", "2026-11-28"], [], TODAY)).toBe(true);
  });

  it("a past match he played ≥ 60 min and the next fixture within 7 days → congested", () => {
    expect(isCongestedWeek(["2026-11-26"], ["2026-11-21"], TODAY)).toBe(true);
  });

  it("a past match he did not play (no row) does not count", () => {
    expect(isCongestedWeek(["2026-11-26"], [], TODAY)).toBe(false);
  });

  it("a past fixture alone from the calendar does not count: only his minutes do", () => {
    // The team played on Saturday (in the fixture list) but he did not play 60 min.
    expect(isCongestedWeek(["2026-11-21", "2026-11-26"], [], TODAY)).toBe(false);
  });

  it("two matches 7 days apart is not two in 7 days", () => {
    expect(isCongestedWeek(["2026-11-29"], ["2026-11-22"], TODAY)).toBe(false);
  });

  it("today must be inside the 7 days: two matches 6 days apart but today too far from the first", () => {
    // Played 6 days ago, next match in 4 days: span with today = 10 days.
    expect(isCongestedWeek(["2026-11-27"], ["2026-11-17"], TODAY)).toBe(false);
  });

  it("a match today counts", () => {
    expect(isCongestedWeek(["2026-11-23", "2026-11-26"], [], TODAY)).toBe(true);
  });

  it("the same date twice is one match", () => {
    expect(isCongestedWeek(["2026-11-26"], ["2026-11-20", "2026-11-20"], TODAY)).toBe(true);
    expect(isCongestedWeek(["2026-11-26", "2026-11-26"], [], TODAY)).toBe(false);
  });

  it("dates out of range are ignored", () => {
    expect(isCongestedWeek(["2026-12-01", "2026-12-03"], ["2026-11-10", "2026-11-12"], TODAY)).toBe(false);
  });
});

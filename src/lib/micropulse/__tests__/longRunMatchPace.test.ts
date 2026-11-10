import { describe, expect, it } from "vitest";
import { componentValue, type MovementDayRow } from "../movementSignature";
import { computeImaRunningLoad } from "../imaRunningLoad";

const row = (over: Partial<MovementDayRow> = {}): MovementDayRow =>
  ({ date: "2026-10-06", totalDistance: 6000, imaDistance: 1200, accelEfforts: 20, decelEfforts: 20, ...over });

describe("movement signature: long-run components read match pace (Nov 2026)", () => {
  it("uses the match-pace metres when the row carries them", () => {
    expect(componentValue("multidirectional", row({ imaMatchPaceDistance: 300 }))).toBe(300);
    expect(componentValue("multidirectional_share", row({ imaMatchPaceDistance: 300 }))).toBeCloseTo(0.05);
  });
  it("0 at match pace is a real value (every long run was a jog), not missing", () => {
    expect(componentValue("multidirectional", row({ imaMatchPaceDistance: 0 }))).toBe(0);
    expect(componentValue("multidirectional_share", row({ imaMatchPaceDistance: 0 }))).toBe(0);
  });
  it("pace unknown (null) or not passed → all long runs, as before", () => {
    expect(componentValue("multidirectional", row({ imaMatchPaceDistance: null }))).toBe(1200);
    expect(componentValue("multidirectional", row())).toBe(1200);
  });
  it("no long-run distance at all → null, and the Core/Lite shares still take over", () => {
    expect(componentValue("multidirectional", row({ imaDistance: 0, imaMatchPaceDistance: 0 }))).toBeNull();
    expect(componentValue("high_speed_share", row({ imaDistance: 0, highSpeedDistance: 600 }))).toBeCloseTo(0.1);
    // a Pro row with 0 at match pace keeps the Pro component set (no high-speed share)
    expect(componentValue("high_speed_share", row({ imaMatchPaceDistance: 0, highSpeedDistance: 600 }))).toBeNull();
  });
});

describe("computeImaRunningLoad presenceDays (confidence on measured days)", () => {
  const days = Array.from({ length: 20 }, (_, i) => ({
    date: new Date(Date.parse("2026-10-31T00:00:00Z") - i * 86_400_000).toISOString().slice(0, 10),
    total: i % 5 === 0 ? 300 : 0, // a match-pace day every 5th day, 0 on the rest
  }));
  it("days > 0 only: 4 run days → not confident", () => {
    const r = computeImaRunningLoad(days, "2026-10-31");
    expect(r.chronicDays).toBe(4);
    expect(r.confident).toBe(false);
  });
  it("presenceDays: 20 measured days (0 included) → confident; the ratio itself is unchanged", () => {
    const a = computeImaRunningLoad(days, "2026-10-31");
    const b = computeImaRunningLoad(days, "2026-10-31", { presenceDays: true });
    expect(b.chronicDays).toBe(20);
    expect(b.confident).toBe(true);
    expect(b.acwr).toBe(a.acwr);
  });
});

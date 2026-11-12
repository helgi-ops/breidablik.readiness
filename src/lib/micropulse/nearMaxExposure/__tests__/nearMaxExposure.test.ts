import { describe, expect, it } from "vitest";
import {
  computeNearMaxExposure, mergeSpeedDays, referenceTopSpeed,
  DUE_DAYS, LONG_GAP_DAYS, NEAR_MAX_PCT, type SpeedDay, type SpeedRow,
} from "../index";

const TODAY = "2026-08-31";
const iso = (daysAgo: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};
/** 12 ordinary days at 26 km/h (60–104 days ago) + the three fastest days: 34 (a spike), 32 and 31. */
const base = (): SpeedDay[] => [
  ...Array.from({ length: 12 }, (_, i) => ({ date: iso(60 + i * 4), kmh: 26 })),
  { date: iso(50), kmh: 34 }, { date: iso(45), kmh: 32 }, { date: iso(40), kmh: 31 },
];

describe("mergeSpeedDays", () => {
  const row = (o: Partial<SpeedRow>): SpeedRow => ({ date: iso(1), maxVelocity: null, maxVel: null, playerLoad: 300, totalDistance: 5000, ...o });
  it("takes the higher of the two speed columns and the best row of the day", () => {
    expect(mergeSpeedDays([row({ maxVelocity: 28.1, maxVel: 29.4 }), row({ maxVelocity: 30.2 })])).toEqual([{ date: iso(1), kmh: 30.2 }]);
  });
  it("an indoor day (load but under 200 m) is unmeasured, not a slow day", () => {
    expect(mergeSpeedDays([row({ maxVelocity: 0, totalDistance: 12 }), row({ date: iso(2), maxVelocity: 14, totalDistance: 40 })])).toEqual([]);
  });
  it("drops implausible speeds", () => {
    expect(mergeSpeedDays([row({ maxVelocity: 99.4 }), row({ date: iso(2), maxVelocity: 4 })])).toEqual([]);
  });
});

describe("referenceTopSpeed", () => {
  it("is the third-fastest day, so one spike can't set it", () => {
    expect(referenceTopSpeed(base(), TODAY)).toEqual({ kmh: 31, source: "gps_third_best", days: 15 });
  });
  it("needs 10 measured days", () => {
    expect(referenceTopSpeed(base().slice(0, 9), TODAY)).toBeNull();
  });
  it("a higher sprint test wins; a lower one doesn't", () => {
    expect(referenceTopSpeed(base(), TODAY, 33.1)?.source).toBe("sprint_test");
    expect(referenceTopSpeed(base(), TODAY, 29)).toEqual({ kmh: 31, source: "gps_third_best", days: 15 });
    expect(referenceTopSpeed([], TODAY, 32)).toEqual({ kmh: 32, source: "sprint_test", days: 0 });
  });
});

describe("computeNearMaxExposure", () => {
  const withRecent = (lastHitDaysAgo: number, extra: SpeedDay[] = []) =>
    [...base().filter((d) => d.kmh < 30), { date: iso(200), kmh: 34 }, { date: iso(190), kmh: 32 }, { date: iso(lastHitDaysAgo), kmh: 31 },
      { date: iso(1), kmh: 24 }, ...extra];

  it("the marks: ≤10 days ok, 11 due, 22 long gap", () => {
    expect(computeNearMaxExposure({ days: withRecent(DUE_DAYS), todayIso: TODAY })?.level).toBe("ok");
    expect(computeNearMaxExposure({ days: withRecent(DUE_DAYS + 1), todayIso: TODAY })?.level).toBe("due");
    expect(computeNearMaxExposure({ days: withRecent(LONG_GAP_DAYS), todayIso: TODAY })?.level).toBe("due");
    expect(computeNearMaxExposure({ days: withRecent(LONG_GAP_DAYS + 1), todayIso: TODAY })?.level).toBe("long_gap");
  });

  it("reports the last run, the target speed and the reference", () => {
    const r = computeNearMaxExposure({ days: withRecent(14), todayIso: TODAY })!;
    expect(r.daysSince).toBe(14);
    expect(r.lastDate).toBe(iso(14));
    expect(r.lastKmh).toBe(31);
    expect(r.ref.kmh).toBe(31);
    expect(r.targetKmh).toBe(Math.round(31 * NEAR_MAX_PCT * 10) / 10);
  });

  it("a day at exactly 90% counts", () => {
    const days = withRecent(30, [{ date: iso(3), kmh: 27.9 }]);
    expect(computeNearMaxExposure({ days, todayIso: TODAY })?.daysSince).toBe(3);
  });

  it("says nothing for a player with no measured day in the last 10 days", () => {
    const days = withRecent(30).filter((d) => d.date < iso(10));
    expect(computeNearMaxExposure({ days, todayIso: TODAY })).toBeNull();
  });

  it("says nothing without a top-speed reference", () => {
    expect(computeNearMaxExposure({ days: [{ date: iso(1), kmh: 25 }], todayIso: TODAY })).toBeNull();
  });

  it("a sprint-test reference with no GPS day near it is a long gap, with high confidence", () => {
    const r = computeNearMaxExposure({ days: [{ date: iso(1), kmh: 25 }, { date: iso(4), kmh: 26 }], todayIso: TODAY, sprintTestKmh: 33 })!;
    expect(r.level).toBe("long_gap");
    expect(r.daysSince).toBeNull();
    expect(r.confidence).toBe("high");
  });

  it("ignores days after today and older than 12 months", () => {
    const days = [...withRecent(30), { date: "2026-09-02", kmh: 33 }, { date: "2025-06-01", kmh: 37 }];
    const r = computeNearMaxExposure({ days, todayIso: TODAY })!;
    expect(r.daysSince).toBe(30);
    expect(r.ref.kmh).toBe(31);
  });
});

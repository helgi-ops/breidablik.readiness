import { describe, it, expect } from "vitest";
import { buildRttTodayRecommendation, type RttResult } from "../returnToTraining";

/**
 * buildRttTodayRecommendation is the ONE engine behind both the coach RTT page
 * and the player's Today card — this locks its math (remaining ÷ remaining
 * sessions), the locomotive/mechanical/mixed steer, and held handling.
 */

type W = { quality: string; target: number; locked?: boolean; unlockWeek?: number };
type C = { quality: string; actual: number };

function mk(weeks: W[], cells: C[], sessions: number): RttResult {
  return {
    plan: {
      verdict: "",
      currentWeek: 2,
      weeks: weeks.map((w) => ({ week: 2, quality: w.quality, target: w.target, pctOfHealthy: 50, wow: 0, acwr: 1, locked: w.locked ?? false, unlockWeek: w.unlockWeek ?? 0, caution: false, why: "" })),
    },
    adherence: [{ week: 2, weekStart: "2026-07-06", sessions, estimatedSessions: 0, inProgress: true, cells: cells.map((c) => ({ quality: c.quality, target: 0, actual: c.actual, deltaPct: 0, status: "on" })) }],
  } as unknown as RttResult;
}

describe("buildRttTodayRecommendation", () => {
  it("today = (weekly − done) ÷ remaining sessions; defaults 4 sessions when planned null", () => {
    const r = mk([{ quality: "distance", target: 18000 }], [{ quality: "distance", actual: 6000 }], 1);
    const rec = buildRttTodayRecommendation(r, null)!;
    expect(rec.plannedSessions).toBe(4);      // null → default
    expect(rec.sessionsDone).toBe(1);
    expect(rec.remainingSessions).toBe(3);    // 4 − 1
    expect(rec.qualities[0].today).toBe(4000); // (18000 − 6000) / 3
  });

  it("steers MECHANICAL when running is mostly done but CoD is behind", () => {
    const r = mk(
      [{ quality: "distance", target: 18000 }, { quality: "hsr", target: 1000 }, { quality: "accel", target: 350 }, { quality: "cod", target: 90 }],
      [{ quality: "distance", actual: 15000 }, { quality: "hsr", actual: 850 }, { quality: "accel", actual: 60 }, { quality: "cod", actual: 10 }],
      1,
    );
    expect(buildRttTodayRecommendation(r, 4)!.sessionType).toBe("mechanical");
  });

  it("steers LOCOMOTIVE when running is behind but CoD is done", () => {
    const r = mk(
      [{ quality: "distance", target: 18000 }, { quality: "cod", target: 90 }],
      [{ quality: "distance", actual: 3000 }, { quality: "cod", actual: 82 }],
      1,
    );
    expect(buildRttTodayRecommendation(r, 4)!.sessionType).toBe("locomotive");
  });

  it("mixed when both axes are on a similar track", () => {
    const r = mk(
      [{ quality: "distance", target: 18000 }, { quality: "cod", target: 90 }],
      [{ quality: "distance", actual: 6000 }, { quality: "cod", actual: 30 }],
      1,
    );
    expect(buildRttTodayRecommendation(r, 4)!.sessionType).toBe("mixed");
  });

  it("holds locked qualities out of the recommendation and lists them", () => {
    const r = mk(
      [{ quality: "distance", target: 18000 }, { quality: "sprint", target: 200, locked: true, unlockWeek: 3 }],
      [{ quality: "distance", actual: 6000 }],
      1,
    );
    const rec = buildRttTodayRecommendation(r, 4)!;
    expect(rec.qualities.map((q) => q.key)).not.toContain("sprint");
    expect(rec.held).toEqual([{ key: "sprint", unlockWeek: 3 }]);
  });
});

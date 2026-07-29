import { describe, it, expect } from "vitest";
import {
  classifyHalf,
  computeMatchIntensityHalves,
  computeTeamFade,
  MIN_HALF_MINUTES,
  type HalfPeriodRow,
} from "../index";

// ── half classifier: spelling variants + exclusions ──────────────────────────
describe("classifyHalf", () => {
  it("matches all three first-half naming families", () => {
    expect(classifyHalf("1st half")).toBe(1);
    expect(classifyHalf("Fyrri hálfleikur")).toBe(1);
    expect(classifyHalf("Fyrri halfleikur")).toBe(1); // no accent
    expect(classifyHalf("First Half")).toBe(1);
  });
  it("matches all three second-half naming families", () => {
    expect(classifyHalf("2nd half")).toBe(2);
    expect(classifyHalf("Seinni hálfleikur")).toBe(2);
    expect(classifyHalf("Seinni halfleikur")).toBe(2);
  });
  it("excludes whole-session and non-half periods", () => {
    expect(classifyHalf("Auto Created Period")).toBeNull();
    expect(classifyHalf("AutoCreatedPeriod")).toBeNull();
    expect(classifyHalf("Period 1")).toBeNull();
    expect(classifyHalf("Possession")).toBeNull();
    expect(classifyHalf("")).toBeNull();
    expect(classifyHalf(null)).toBeNull();
    expect(classifyHalf(undefined)).toBeNull();
  });
});

// ── test data builder ────────────────────────────────────────────────────────
function half(
  over: Partial<HalfPeriodRow> & { half: 1 | 2 },
): HalfPeriodRow {
  return {
    playerId: "p1",
    playerName: "Test Player",
    position: "MID",
    savedSessionId: null,
    sessionDate: "2026-07-01",
    durationMin: 50,
    highIma: 0,
    imaAccel: 0,
    imaDecel: 0,
    imaCodTotal: 0,
    hirTotal: null,
    playerLoadPerMin: null,
    ...over,
  };
}

describe("computeMatchIntensityHalves — per-minute math", () => {
  it("computes per-minute fade, not raw totals (unequal halves)", () => {
    // h1: 10 high over 50 min = 0.20/min; h2: 6 high over 60 min = 0.10/min.
    // Raw totals would read only -40%; per-minute reads -50%.
    const rows: HalfPeriodRow[] = [
      half({ half: 1, savedSessionId: "m1", durationMin: 50, highIma: 10 }),
      half({ half: 2, savedSessionId: "m1", durationMin: 60, highIma: 6 }),
    ];
    const [p] = computeMatchIntensityHalves(rows);
    expect(p.matches).toHaveLength(1);
    expect(p.matches[0].h1HighPerMin).toBeCloseTo(0.2, 3);
    expect(p.matches[0].h2HighPerMin).toBeCloseTo(0.1, 3);
    expect(p.matches[0].pctChangeHigh).toBeCloseTo(-50, 1);
  });

  it("totals IMA per minute from accel+decel+cod", () => {
    const rows: HalfPeriodRow[] = [
      half({ half: 1, savedSessionId: "m1", durationMin: 50, highIma: 5, imaAccel: 100, imaDecel: 100, imaCodTotal: 50 }),
      half({ half: 2, savedSessionId: "m1", durationMin: 50, highIma: 5, imaAccel: 50, imaDecel: 50, imaCodTotal: 25 }),
    ];
    const [p] = computeMatchIntensityHalves(rows);
    expect(p.matches[0].h1TotalPerMin).toBeCloseTo(5, 2); // 250/50
    expect(p.matches[0].h2TotalPerMin).toBeCloseTo(2.5, 2); // 125/50
    expect(p.matches[0].pctChangeTotal).toBeCloseTo(-50, 1);
  });
});

describe("match key = player + session_date (saved_session_id is null on real data)", () => {
  it("joins both halves by date even when savedSessionId is null/absent", () => {
    const rows: HalfPeriodRow[] = [
      half({ half: 1, savedSessionId: null, sessionDate: "2026-07-05", durationMin: 50, highIma: 10 }),
      half({ half: 2, savedSessionId: null, sessionDate: "2026-07-05", durationMin: 50, highIma: 6 }),
    ];
    const [p] = computeMatchIntensityHalves(rows);
    expect(p.nMatches).toBe(1);
    expect(p.matches[0].pctChangeHigh).toBeCloseTo(-40, 1);
  });

  it("treats different dates as different matches for the same player", () => {
    const rows: HalfPeriodRow[] = [
      half({ half: 1, sessionDate: "2026-07-05", durationMin: 50, highIma: 10 }),
      half({ half: 2, sessionDate: "2026-07-05", durationMin: 50, highIma: 8 }),
      half({ half: 1, sessionDate: "2026-07-12", durationMin: 50, highIma: 10 }),
      half({ half: 2, sessionDate: "2026-07-12", durationMin: 50, highIma: 6 }),
    ];
    expect(computeMatchIntensityHalves(rows)[0].nMatches).toBe(2);
  });
});

describe("both-halves gate", () => {
  it("excludes a match missing a half (a one-half sub) → no qualifying match", () => {
    const rows: HalfPeriodRow[] = [
      half({ half: 1, savedSessionId: "m1", durationMin: 50, highIma: 10 }),
    ];
    const [p] = computeMatchIntensityHalves(rows);
    expect(p.nMatches).toBe(0);
    expect(p.typicalPctChangeHigh).toBeNull();
    expect(p.latestPctChangeHigh).toBeNull();
  });

  it(`excludes a match where a half is under ${MIN_HALF_MINUTES} min`, () => {
    const rows: HalfPeriodRow[] = [
      half({ half: 1, savedSessionId: "m1", durationMin: 50, highIma: 10 }),
      half({ half: 2, savedSessionId: "m1", durationMin: MIN_HALF_MINUTES - 1, highIma: 3 }),
    ];
    const [p] = computeMatchIntensityHalves(rows);
    expect(p.nMatches).toBe(0);
  });

  it(`counts a match where both halves are exactly ${MIN_HALF_MINUTES} min`, () => {
    const rows: HalfPeriodRow[] = [
      half({ half: 1, savedSessionId: "m1", durationMin: MIN_HALF_MINUTES, highIma: 8 }),
      half({ half: 2, savedSessionId: "m1", durationMin: MIN_HALF_MINUTES, highIma: 4 }),
    ];
    const [p] = computeMatchIntensityHalves(rows);
    expect(p.nMatches).toBe(1);
  });
});

describe("confidence floor", () => {
  const mk = (n: number): HalfPeriodRow[] =>
    Array.from({ length: n }).flatMap((_, i) => [
      half({ half: 1, savedSessionId: `m${i}`, sessionDate: `2026-07-0${i + 1}`, durationMin: 50, highIma: 10 }),
      half({ half: 2, savedSessionId: `m${i}`, sessionDate: `2026-07-0${i + 1}`, durationMin: 50, highIma: 6 }),
    ]);

  it("labels <3 matches as building", () => {
    expect(computeMatchIntensityHalves(mk(1))[0].confidence).toBe("building");
    expect(computeMatchIntensityHalves(mk(2))[0].confidence).toBe("building");
  });
  it("labels 3–5 matches as moderate", () => {
    expect(computeMatchIntensityHalves(mk(3))[0].confidence).toBe("moderate");
    expect(computeMatchIntensityHalves(mk(5))[0].confidence).toBe("moderate");
  });
  it("labels ≥6 matches as high", () => {
    expect(computeMatchIntensityHalves(mk(6))[0].confidence).toBe("high");
  });
});

describe("driver (plain why) + rolling typical + sort + team", () => {
  it("names the movement that dropped most per minute", () => {
    const rows: HalfPeriodRow[] = [
      half({ half: 1, savedSessionId: "m1", durationMin: 50, highIma: 10, imaAccel: 100, imaDecel: 100, imaCodTotal: 100 }),
      // cod collapses, accel/decel steady → driver = cod
      half({ half: 2, savedSessionId: "m1", durationMin: 50, highIma: 6, imaAccel: 100, imaDecel: 100, imaCodTotal: 20 }),
    ];
    expect(computeMatchIntensityHalves(rows)[0].matches[0].driver).toBe("cod");
  });

  it("typical = mean of per-match fades; latest = newest match", () => {
    const rows: HalfPeriodRow[] = [
      half({ half: 1, savedSessionId: "old", sessionDate: "2026-07-01", durationMin: 50, highIma: 10 }),
      half({ half: 2, savedSessionId: "old", sessionDate: "2026-07-01", durationMin: 50, highIma: 8 }), // -20%
      half({ half: 1, savedSessionId: "new", sessionDate: "2026-07-10", durationMin: 50, highIma: 10 }),
      half({ half: 2, savedSessionId: "new", sessionDate: "2026-07-10", durationMin: 50, highIma: 6 }), // -40%
    ];
    const [p] = computeMatchIntensityHalves(rows);
    expect(p.latestPctChangeHigh).toBeCloseTo(-40, 1); // newest first
    expect(p.typicalPctChangeHigh).toBeCloseTo(-30, 1); // mean(-20,-40)
  });

  it("sorts the biggest fade first and one-half players last", () => {
    const rows: HalfPeriodRow[] = [
      // small fader
      half({ playerId: "small", playerName: "Small", half: 1, savedSessionId: "s1", durationMin: 50, highIma: 10 }),
      half({ playerId: "small", playerName: "Small", half: 2, savedSessionId: "s1", durationMin: 50, highIma: 9 }),
      // big fader
      half({ playerId: "big", playerName: "Big", half: 1, savedSessionId: "b1", durationMin: 50, highIma: 10 }),
      half({ playerId: "big", playerName: "Big", half: 2, savedSessionId: "b1", durationMin: 50, highIma: 4 }),
      // one-half only → no qualifying match
      half({ playerId: "sub", playerName: "Sub", half: 1, savedSessionId: "u1", durationMin: 50, highIma: 8 }),
    ];
    const res = computeMatchIntensityHalves(rows);
    expect(res.map((r) => r.playerId)).toEqual(["big", "small", "sub"]);
    expect(res[2].nMatches).toBe(0);
  });

  it("team fade pools qualifying matches; excludes one-half players from nPlayers", () => {
    const rows: HalfPeriodRow[] = [
      half({ playerId: "a", playerName: "A", half: 1, savedSessionId: "a1", durationMin: 50, highIma: 10 }),
      half({ playerId: "a", playerName: "A", half: 2, savedSessionId: "a1", durationMin: 50, highIma: 5 }),
      half({ playerId: "b", playerName: "B", half: 1, savedSessionId: "b1", durationMin: 50, highIma: 10 }),
      // b only played one half → contributes no match
    ];
    const team = computeTeamFade(computeMatchIntensityHalves(rows));
    expect(team).not.toBeNull();
    expect(team!.nPlayers).toBe(1);
    expect(team!.nMatches).toBe(1);
    expect(team!.pctChangeHigh).toBeCloseTo(-50, 1);
  });

  it("returns null team fade when nothing qualifies", () => {
    const rows: HalfPeriodRow[] = [
      half({ half: 1, savedSessionId: "m1", durationMin: 50, highIma: 10 }),
    ];
    expect(computeTeamFade(computeMatchIntensityHalves(rows))).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { squadVsUsual, isOutsideUsual, longRunsLine } from "../squadSummary";
import { EMPTY_SUB, significanceThreshold, type MatchMovementResult, type MatchMovementRow } from "../types";

function row(id: string, date: string, opts: Partial<MatchMovementRow> & { lr?: number | null; mp?: number | null; hi?: number } = {}): MatchMovementRow {
  return {
    player_id: id, name: id, position: null, match_date: date, minutes: opts.minutes ?? 90,
    estimated: opts.estimated ?? false, contaminated: opts.contaminated ?? false,
    fingerprint: { totalPerMin: 10, accelDecelRatio: 1, codPerMin: 5, codLeftPct: 50, hiCadencePerMin: opts.hi ?? 6 },
    raw: { imaTotal: null, codTotal: null, codLeft: null, codRight: null, hiCadence: null },
    sub: { ...EMPTY_SUB, longRuns: opts.lr === undefined ? 15 : opts.lr, longRunsMp: opts.mp === undefined ? 13 : opts.mp },
  };
}
const result = (rows: MatchMovementRow[]): MatchMovementResult => ({
  teamId: "t", variant: "ima", matchDates: [...new Set(rows.map((r) => r.match_date))], rows,
  playerAverages: {}, subAverages: {}, minutesAverages: {}, players: [],
});

describe("significance thresholds", () => {
  it("long runs need 50%, rates 20%, left/right 10 points", () => {
    expect(significanceThreshold("hiCadencePerMin")).toBe(50);
    expect(significanceThreshold("totalPerMin")).toBe(20);
    expect(significanceThreshold("codLeftPct")).toBe(10);
    expect(isOutsideUsual("hiCadencePerMin", 30)).toBe(false);
    expect(isOutsideUsual("hiCadencePerMin", -60)).toBe(true);
    expect(isOutsideUsual("totalPerMin", 30)).toBe(true);
  });
});

describe("squadVsUsual", () => {
  it("leaves warm-up rows out of this match and the usual, estimates out of the usual", () => {
    const rows = [
      row("a", "2026-09-01"), row("b", "2026-09-01"), row("c", "2026-09-01"),
      row("sub", "2026-09-01", { contaminated: true, hi: 0, minutes: 25 }),
      row("a", "2026-08-01", { hi: 12 }), row("b", "2026-08-01", { hi: 12 }), row("c", "2026-08-01", { hi: 12 }),
      row("est", "2026-08-01", { estimated: true, hi: 1000 }),
    ];
    const sq = squadVsUsual(result(rows), "2026-09-01");
    expect(sq.counted.map((r) => r.name)).toEqual(["a", "b", "c"]);
    expect(sq.notCounted.map((r) => r.name)).toEqual(["sub"]);
    const lr = sq.dims.find((x) => x.d.key === "hiCadencePerMin")!;
    expect(lr.cur).toBe(6);
    expect(lr.base).toBe(9); // (3×6 + 3×12) / 6 — the estimate and the warm-up are not in it
    expect(lr.rel).toBeCloseTo(-33.3, 1);
    expect(lr.flagged).toBe(false); // −33% is normal spread for long runs
  });

  it("gives pooled long runs per 90 min, and null without a count", () => {
    const rows = [
      row("a", "2026-09-01", { lr: 10, mp: 9, minutes: 90 }),
      row("b", "2026-09-01", { lr: 5, mp: 5, minutes: 45 }),
      row("c", "2026-09-01", { lr: 15, mp: null, minutes: 90 }),
    ];
    const sq = squadVsUsual(result(rows), "2026-09-01");
    expect(sq.longRuns!.thisMatch).toBeCloseTo(((10 + 5 + 15) / 225) * 90, 6);
    expect(sq.longRuns!.thisMatchMp).toBeNull(); // only 2 rows with a match-pace count
    expect(longRunsLine(sq.longRuns, false)).toBe("Long runs (18 s or more): 12.0 per 90 min this match · usual 12.0.");

    const old = squadVsUsual(result(rows.map((r) => ({ ...r, sub: { ...r.sub, longRuns: null, longRunsMp: null } }))), "2026-09-01");
    expect(old.longRuns).toBeNull();
    expect(longRunsLine(old.longRuns, true)).toBeNull();
  });
});

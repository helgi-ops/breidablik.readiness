import { describe, it, expect } from "vitest";
import { buildSeasonReport, seasonHeadline, type OwnMatchRow, type OppMatchRow } from "../index";

// Three fixtures: a win, a draw, a loss.
const own: OwnMatchRow[] = [
  { date: "2026-06-01", result: "W", home: true, goals: 3, xg: 2.0, shots: 15, possessionPct: 55, ppda: 9, defDuelsWonPct: 55 },
  { date: "2026-06-08", result: "D", home: false, goals: 1, xg: 1.0, shots: 10, possessionPct: 50, ppda: 12, defDuelsWonPct: 50 },
  { date: "2026-06-15", result: "L", home: false, goals: 1, xg: 2.0, shots: 12, possessionPct: 60, ppda: 8, defDuelsWonPct: 45 },
];
const opp: OppMatchRow[] = [
  { date: "2026-06-01", goals: 1, xg: 1.4, shots: 10 }, // win: conceded 1 on 1.4 xG → saved 0.4
  { date: "2026-06-08", goals: 1, xg: 1.2, shots: 9 },
  { date: "2026-06-15", goals: 3, xg: 2.6, shots: 18 }, // loss: conceded 3 on 2.6 → saved −0.4
];

describe("buildSeasonReport", () => {
  const r = buildSeasonReport({ team: "Breiðablik", own, opp });

  it("counts record and points", () => {
    expect(r.record).toEqual({ w: 1, d: 1, l: 1 });
    expect(r.points).toBe(4); // 3 + 1
    expect(r.ppg).toBeCloseTo(4 / 3, 2);
  });

  it("averages per-match attack + defence, and derives goal/xG difference", () => {
    expect(r.perMatch.goalsFor).toBeCloseTo((3 + 1 + 1) / 3, 2);
    expect(r.perMatch.goalsAgainst).toBeCloseTo((1 + 1 + 3) / 3, 2);
    expect(r.perMatch.goalDiff).toBeCloseTo(5 / 3 - 5 / 3, 2); // both 1.67 → 0
    expect(r.perMatch.xgFor).toBeCloseTo((2 + 1 + 2) / 3, 2);
    expect(r.perMatch.xgAgainst).toBeCloseTo((1.4 + 1.2 + 2.6) / 3, 2);
  });

  it("computes goalkeeping goals-saved as xG conceded minus goals conceded, per match", () => {
    // per-match saved: 0.4, 0.2, -0.4 → mean 0.0667
    expect(r.perMatch.goalsSaved).toBeCloseTo((0.4 + 0.2 - 0.4) / 3, 2);
  });

  it("computes finishing as goals minus xG per match", () => {
    // per-match: (3-2)+(1-1)+(1-2) = 1+0-1 = 0 → mean 0
    expect(r.perMatch.finishing).toBeCloseTo(0, 5);
  });

  it("splits xG-against wins vs losses and flags low sample", () => {
    expect(r.winsVsLosses.xgAgainst.win.mean).toBeCloseTo(1.4, 2);
    expect(r.winsVsLosses.xgAgainst.loss.mean).toBeCloseTo(2.6, 2);
    expect(r.confidence.lowSample).toBe(true); // only 1 loss
  });

  it("extracts a compact model headline for the comparison table", () => {
    const h = seasonHeadline("statsbomb", r);
    expect(h.source).toBe("statsbomb");
    expect(h.matches).toBe(3);
    expect(h.record).toEqual({ w: 1, d: 1, l: 1 });
    expect(h.xgFor).toBeCloseTo(r.perMatch.xgFor!, 5);
    expect(h.goalsSaved).toBeCloseTo(r.perMatch.goalsSaved!, 5);
  });

  it("splits home vs away by the per-match venue flag", () => {
    // home = the single win (2026-06-01); away = the draw + loss.
    expect(r.homeAway.home.n).toBe(1);
    expect(r.homeAway.home.w).toBe(1);
    expect(r.homeAway.home.goalsFor).toBeCloseTo(3, 5);
    expect(r.homeAway.away.n).toBe(2);
    expect(r.homeAway.away.w).toBe(0);
    expect(r.homeAway.away.l).toBe(1);
    // away xG for = mean(1.0, 2.0) = 1.5; against = mean(1.2, 2.6) = 1.9 → diff −0.4
    expect(r.homeAway.away.xgFor).toBeCloseTo(1.5, 2);
    expect(r.homeAway.away.xgDiff).toBeCloseTo(-0.4, 2);
  });

  it("ignores nulls without inventing values", () => {
    const r2 = buildSeasonReport({
      team: "X",
      own: [{ date: "2026-01-01", result: "W", home: true, goals: 2, xg: null, shots: null, possessionPct: null, ppda: null, defDuelsWonPct: null }],
      opp: [{ date: "2026-01-01", goals: 0, xg: null, shots: null }],
    });
    expect(r2.perMatch.xgFor).toBeNull();
    expect(r2.perMatch.goalsSaved).toBeNull(); // opp xg null → can't compute
    expect(r2.perMatch.goalsFor).toBe(2);
  });
});

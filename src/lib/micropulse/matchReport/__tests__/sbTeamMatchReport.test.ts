import { describe, it, expect } from "vitest";
import { buildSbTeamMatchReport, fmtVal, type SbTeamRow } from "../sbTeamMatchReport";

// The real KR Reykjavík vs Breiðablik match (2026-08-16) from sb_team_match_stats.
const KR: SbTeamRow = {
  match_date: "2026-08-16", opponent: "KR Reykjavík", is_home: false,
  goals: 3, goals_against: 3, xg: 3.24, xg_against: 2.74, shots: 22, shots_against: 23,
  passes: 356, passing_pct: 70.2, passes_into_box: 39, deep_progressions: 42,
  crosses: 24, box_touches: 49, pressures: 177, counterpressures: 80, obv: 3.56,
};
const SEASON: SbTeamRow[] = [
  KR,
  { match_date: "2026-08-09", xg: 1.16, xg_against: 2.18, shots: 17, passes: 489, passes_into_box: 41, deep_progressions: 61, box_touches: 43, pressures: 137, obv: 0.57 },
  { match_date: "2026-08-04", xg: 1.8, xg_against: 1.72, shots: 16, passes: 562, passes_into_box: 36, deep_progressions: 46, box_touches: 42, pressures: 106, obv: 0.72 },
  { match_date: "2026-07-27", xg: 0.77, xg_against: 1.01, shots: 10, passes: 540, passes_into_box: 31, deep_progressions: 54, box_touches: 36, pressures: 126, obv: 2.64 },
];

describe("buildSbTeamMatchReport", () => {
  const r = buildSbTeamMatchReport(KR, SEASON);

  it("leads the glance on the xG battle", () => {
    expect(r.headline.en).toContain("better chances");
    expect(r.headline.en).toContain("3.24");
    expect(r.goals).toBe(3);
    expect(r.opponent).toBe("KR Reykjavík");
  });

  it("pairs for/against on xG and shots, own-only elsewhere", () => {
    const attack = r.sections.find((s) => s.group === "attack")!;
    const xg = attack.metrics.find((m) => m.key === "xg")!;
    expect(xg.own).toBe(3.24); expect(xg.opp).toBe(2.74);
    const boxTouch = attack.metrics.find((m) => m.key === "box_touches")!;
    expect(boxTouch.own).toBe(49); expect(boxTouch.opp).toBeNull();
  });

  it("computes the season average excluding this match", () => {
    const pressing = r.sections.find((s) => s.group === "pressing")!;
    const pressures = pressing.metrics.find((m) => m.key === "pressures")!;
    // avg of the other three: (137 + 106 + 126) / 3 = 123
    expect(pressures.seasonAvg).toBeCloseTo(123, 0);
    expect(pressures.own).toBe(177);
  });

  it("surfaces a standout fact above the season norm", () => {
    // pressures 177 vs ~123 avg = +44% → should be pickable
    const hasStandout = r.facts.some((f) => /above your season norm/.test(f.en));
    expect(hasStandout).toBe(true);
  });

  it("marks a metric absent from the row as no-data (null), still counted in total", () => {
    const buildup = r.sections.find((s) => s.group === "buildup")!;
    const ppdaMissing = r.sections.find((s) => s.group === "pressing")!.metrics.find((m) => m.key === "ppda")!;
    expect(ppdaMissing.own).toBeNull(); // not in the per-player file
    expect(buildup.metrics.find((m) => m.key === "passes")!.own).toBe(356);
    expect(r.coverage.total).toBeGreaterThan(r.coverage.present);
  });

  it("PPDA is lower-is-better; xG is higher-is-better", () => {
    const pressing = r.sections.find((s) => s.group === "pressing")!;
    expect(pressing.metrics.find((m) => m.key === "ppda")!.higherIsBetter).toBe(false);
    const attack = r.sections.find((s) => s.group === "attack")!;
    expect(attack.metrics.find((m) => m.key === "xg")!.higherIsBetter).toBe(true);
  });

  it("estimates PPDA and possession from opponent passes, flagged as estimates", () => {
    const row = { ...KR, passes: 410, opposition_passes: 447, tackles: 23, interceptions: 9, fouls: 14 };
    const rep = buildSbTeamMatchReport(row, [row]);
    const ppda = rep.sections.find((s) => s.group === "pressing")!.metrics.find((m) => m.key === "ppda")!;
    // 447 ÷ (23+9+14) = 9.72
    expect(ppda.own).toBeCloseTo(9.7, 1);
    expect(ppda.estimated).toBe(true);
    const poss = rep.sections.find((s) => s.group === "buildup")!.metrics.find((m) => m.key === "possession_pct")!;
    // 410 ÷ (410+447) = 47.8%
    expect(poss.own).toBeCloseTo(47.8, 1);
    expect(poss.estimated).toBe(true);
  });

  it("formats values by type", () => {
    expect(fmtVal(3.241, "dec2")).toBe("3.24");
    expect(fmtVal(70.2, "pct")).toBe("70%");
    expect(fmtVal(22, "int")).toBe("22");
    expect(fmtVal(null, "int")).toBe("—");
  });
});

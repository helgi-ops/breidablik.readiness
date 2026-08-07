import { describe, it, expect } from "vitest";
import { buildOpponentReport, type Metrics } from "../opponentReport";
import { metricsFromSbSeason, metricsFromLeagueRef } from "../aggregate";
import type { SbTeamSeason } from "../../statsIngestion/statsbombLeagueTeam";

const M = (o: Partial<Metrics>): Metrics => ({ xgf: null, xga: null, gf: null, ga: null, shots: null, shotsAgainst: null, possession: null, ppda: null, defDuelsWonPct: null, forwardPasses: null, forwardPassAccPct: null, passesFinalThird: null, passesFinalThirdAccPct: null, progressivePasses: null, smartPasses: null, smartPassAccPct: null, crosses: null, crossAccPct: null, positionalAttacks: null, counterattacks: null, offensiveDuelsWonPct: null, ...o });
const valur = M({ xgf: 1.56, xga: 1.87, gf: 1.65, ga: 2.06, shots: 14.41, shotsAgainst: 19.35, ppda: 11.57, possession: 49.9 });
const league = M({ xgf: 1.61, xga: 1.61, shotsAgainst: 15.44, ppda: 11.04 });
const sbExtras = { team: { obv: 2.15, obvAgainst: 2.51, setPieceXg: 0.4, setPieceXgAgainst: 0.55, setPieceShotsAgainst: 5.18, carryObvConceded: 1.29, clearShots: 3.35, clearShotsFaced: 3.9, cornerXg: 0.33, throwInXg: 0.11 }, league: { obv: 2.2, obvAgainst: 2.2, setPieceXg: 0.38, setPieceXgAgainst: 0.38, clearShots: 3.17, clearShotsFaced: 3.17, cornerXg: 0.26, throwInXg: 0.03 } };

describe("scouting source resolver (StatsBomb present vs Wyscout fallback)", () => {
  it("tags the report source and exposes StatsBomb extras when statsbomb", () => {
    const r = buildOpponentReport({ opponent: { name: "Valur", matches: 17, m: valur }, league, own: M({}), matches: [], players: [], season: "2026", source: "statsbomb", sbExtras });
    expect(r.source).toBe("statsbomb");
    expect(r.statsbomb?.obvAgainst).toBeCloseTo(2.51, 2);
    expect(r.statsbomb?.setPieceXgAgainstLeague).toBeCloseTo(0.38, 2);
  });

  it("uses real StatsBomb set-piece xG in the set-piece verdict", () => {
    const r = buildOpponentReport({ opponent: { name: "Valur", matches: 17, m: valur }, league, own: M({}), matches: [], players: [], season: "2026", source: "statsbomb", sbExtras });
    expect(r.setPieces.verdict.en).toMatch(/StatsBomb xG/);
    expect(r.setPieces.flags).toContain("weak_set_piece_defence"); // 0.55 vs 0.38 league
  });

  it("surfaces clear shots + corner/throw-in signals (parity with the team report)", () => {
    const r = buildOpponentReport({ opponent: { name: "Valur", matches: 17, m: valur }, league, own: M({}), matches: [], players: [], season: "2026", source: "statsbomb", sbExtras });
    expect(r.statsbomb?.clearShots).toBeCloseTo(3.35, 2);
    expect(r.statsbomb?.clearShotsAgainst).toBeCloseTo(3.9, 2);       // exposure signal
    expect(r.statsbomb?.cornerXg).toBeCloseTo(0.33, 2);
    // corner xG 0.33 >= league 0.26 + 0.03 → corner route flagged + named in the verdict.
    expect(r.setPieces.flags).toContain("corner_threat");
    expect(r.setPieces.verdict.en).toMatch(/Corners are the main route/);
    // corner + throw-in xG appear as cited facts in the set-piece block.
    expect(r.setPieces.facts.some((f) => f.metric === "cornerXg")).toBe(true);
    expect(r.setPieces.facts.some((f) => f.metric === "throwInXg")).toBe(true);
  });

  it("falls back to Wyscout (no source): no statsbomb block, player-based set pieces", () => {
    const r = buildOpponentReport({ opponent: { name: "Valur", matches: 17, m: valur }, league, own: M({}), matches: [], players: [], season: "2026" });
    expect(r.source).toBe("wyscout");
    expect(r.statsbomb).toBeNull();
    expect(r.setPieces.verdict.en).not.toMatch(/StatsBomb xG/);
  });
});

describe("StatsBomb metric mappers", () => {
  it("metricsFromSbSeason maps npxG/ppda into agnostic Metrics", () => {
    const s: SbTeamSeason = { name: "Valur", isLeagueAverage: false, games: 17, possessionIsProxy: true,
      metrics: { xgf: 1.56, xga: 1.87, gf: 1.65, ga: 2.06, shots: 14.41, shotsAgainst: 19.35, possession: 49.9, ppda: 11.57, crosses: 9.29, crossAccPct: 28, passesFinalThird: 4.47, passingPct: 79 }, sb: {} };
    const m = metricsFromSbSeason(s);
    expect(m.xgf).toBe(1.56); expect(m.ppda).toBe(11.57); expect(m.forwardPassAccPct).toBe(79); expect(m.defDuelsWonPct).toBeNull();
  });

  it("metricsFromLeagueRef reads a stored jsonb benchmark", () => {
    const m = metricsFromLeagueRef({ xgf: 1.61, xga: 1.61, ppda: 11.04 });
    expect(m?.xgf).toBe(1.61); expect(m?.ppda).toBe(11.04);
    expect(metricsFromLeagueRef(null)).toBeNull();
  });
});

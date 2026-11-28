import { describe, it, expect } from "vitest";
import { buildSessionEnough, dayShare, MIN_FMP_PLAYERS, FMP_SOURCE, type EnoughPlayerInput, type FmpValues, type VarValues } from "@/lib/micropulse/sessionEnough";
import { fmpOf } from "@/lib/micropulse/sessionEnough/dayRows";

const REF: VarValues = { imaAccel: 70, imaDecel: 100, imaCod: 440, hsr: 900, sprint: 200, longRuns: 11, longRunsMp: 10, frDistance: 1300, strideHi: 390 };
const FMP_MATCH: FmpValues = { runHigh: 144, dynHigh: 625, dynMed: 1042 };

function player(id: string, f: number, fmpShare: number | null, extra: Partial<EnoughPlayerInput> = {}): EnoughPlayerInput {
  const actual = {} as VarValues;
  for (const k of Object.keys(REF) as Array<keyof VarValues>) actual[k] = (REF[k] as number) * dayShare(k, 60) * f;
  const fmp = fmpShare == null ? null : {
    actual: { runHigh: FMP_MATCH.runHigh! * fmpShare, dynHigh: FMP_MATCH.dynHigh! * fmpShare, dynMed: FMP_MATCH.dynMed! * fmpShare },
    matchRef: FMP_MATCH,
  };
  return { playerId: id, name: `P${id}`, actual, matchRef: REF, refSource: "own", refMatches: 6, partial: false, fmp, ...extra };
}
const base = { sessionDate: "2026-10-22", mdLabel: "MD-3", matchPct: 60, mdSource: "week_setup" as const, isMatchDay: false, squadSize: 5, dayType: "mechanical" as const, dayTypeSource: "week_setup" as const };

describe("movement profile (Football Movement Profile, shown not judged)", () => {
  it("gives the squad's time and % of a match per band", () => {
    const r = buildSessionEnough({ ...base, players: ["1", "2", "3", "4"].map((id) => player(id, 1, 0.4)) });
    expect(r.movementProfile?.players).toBe(4);
    const dyn = r.movementProfile!.bands.find((b) => b.key === "dynHigh")!;
    expect(dyn.pctOfMatch).toBe(40);
    expect(dyn.actualS).toBe(250);
    expect(dyn.matchS).toBe(625);
    expect(r.citations).toContain(FMP_SOURCE);
    expect(r.players[0].fmp?.find((b) => b.key === "runHigh")?.pctOfMatch).toBe(40);
  });

  it("is absent with fewer than MIN_FMP_PLAYERS players with the bands", () => {
    const players = Array.from({ length: 4 }, (_, i) => player(String(i), 1, i < MIN_FMP_PLAYERS - 1 ? 0.4 : null));
    const r = buildSessionEnough({ ...base, players });
    expect(r.movementProfile).toBeNull();
    expect(r.citations).not.toContain(FMP_SOURCE);
    expect(r.players[3].fmp).toBeNull();
  });

  it("never changes the verdict, headline, facts or per-player verdicts", () => {
    for (const f of [1, 0.75, 0.4]) {
      const without = buildSessionEnough({ ...base, players: ["1", "2", "3", "4"].map((id) => player(id, f, null)) });
      // Wildly low and wildly high movement profiles must leave the answer alone.
      for (const share of [0.05, 2.5]) {
        const withFmp = buildSessionEnough({ ...base, players: ["1", "2", "3", "4"].map((id) => player(id, f, share)) });
        expect(withFmp.movementProfile).not.toBeNull();
        expect(withFmp.verdict).toBe(without.verdict);
        expect(withFmp.headline).toEqual(without.headline);
        expect(withFmp.facts).toEqual(without.facts);
        expect(withFmp.counterfactual).toEqual(without.counterfactual);
        expect(withFmp.overNote).toEqual(without.overNote);
        expect(withFmp.team).toEqual(without.team);
        expect(withFmp.players.map((p) => p.verdict)).toEqual(without.players.map((p) => p.verdict));
      }
    }
  });

  it("leaves shortened sessions out of the squad median", () => {
    const players = [player("1", 1, 0.4), player("2", 1, 0.4), player("3", 1, 0.4), player("4", 0.2, 0.05, { partial: true })];
    const r = buildSessionEnough({ ...base, players });
    expect(r.movementProfile?.players).toBe(3);
    expect(r.movementProfile?.bands.every((b) => b.pctOfMatch === 40)).toBe(true);
    expect(r.players.find((p) => p.playerId === "4")?.fmp?.[0].pctOfMatch).toBe(5);
  });

  it("is still shown when there is no MD context (no verdict)", () => {
    const r = buildSessionEnough({ ...base, mdLabel: null, matchPct: null, mdSource: null, dayType: null, players: ["1", "2", "3"].map((id) => player(id, 1, 0.5)) });
    expect(r.state).toBe("no_md");
    expect(r.movementProfile?.bands[0].pctOfMatch).toBe(50);
  });
});

describe("fmpOf", () => {
  it("reads the three bands when the row has an FMP reading", () => {
    expect(fmpOf({ fmp_total_duration_s: 3600, fmp_running_high_s: 30, fmp_dynamic_high_s: 240, fmp_dynamic_medium_s: 0 }))
      .toEqual({ runHigh: 30, dynHigh: 240, dynMed: 0 });
  });
  it("is null in every band without an FMP reading", () => {
    expect(fmpOf({ fmp_total_duration_s: 0, fmp_running_high_s: 30 })).toEqual({ runHigh: null, dynHigh: null, dynMed: null });
    expect(fmpOf({ ima_accel: 40 })).toEqual({ runHigh: null, dynHigh: null, dynMed: null });
  });
});

import { describe, it, expect } from "vitest";
import { buildSessionEnough, dayShare, emptyEnough, type EnoughPlayerInput, type VarValues } from "@/lib/micropulse/sessionEnough";

const REF: VarValues = { imaAccel: 70, imaDecel: 100, imaCod: 440, frDistance: 1300, strideHi: 390 };

/** A player who did `f` × the MD-day's target on every variable (optionally overriding some). */
function player(id: string, md: number, f: number, over: Partial<VarValues> = {}, extra: Partial<EnoughPlayerInput> = {}): EnoughPlayerInput {
  const actual = {} as VarValues;
  for (const k of Object.keys(REF) as Array<keyof VarValues>) actual[k] = (REF[k] as number) * dayShare(k, md) * f;
  return { playerId: id, name: `P${id}`, actual: { ...actual, ...over }, matchRef: REF, refSource: "own", refMatches: 6, partial: false, ...extra };
}

const base = { sessionDate: "2026-10-22", mdLabel: "MD-3", matchPct: 85, mdSource: "week_setup" as const, isMatchDay: false, squadSize: 4 };

describe("dayShare", () => {
  it("is the matchPct fraction raised to the variable's exponent", () => {
    expect(dayShare("imaDecel", 50)).toBeCloseTo(0.5, 5);           // e = 1
    expect(dayShare("strideHi", 32)).toBeGreaterThan(0.32);          // flatter than volume
    expect(dayShare("frDistance", 32)).toBeLessThan(0.32);           // tapers harder
  });
});

describe("buildSessionEnough", () => {
  it("says YES when every variable reaches ≥85% of the day's target", () => {
    const r = buildSessionEnough({ ...base, players: ["1", "2", "3", "4"].map((id) => player(id, 85, 1.0)) });
    expect(r.state).toBe("ok");
    expect(r.verdict).toBe("yes");
    expect(r.counterfactual).toBeNull();
    expect(r.team.every((t) => t.pctOfTarget === 100)).toBe(true);
    expect(r.confidence.level).toBe("high");
  });

  it("says MOSTLY when one variable is short, and names it with a counterfactual", () => {
    const decelLow = REF.imaDecel! * dayShare("imaDecel", 85) * 0.7;
    const r = buildSessionEnough({ ...base, players: ["1", "2", "3", "4"].map((id) => player(id, 85, 1.0, { imaDecel: decelLow })) });
    expect(r.verdict).toBe("mostly");
    expect(r.headline.en).toContain("braking");
    expect(r.counterfactual?.en).toMatch(/more braking actions per player/);
    expect(r.counterfactual?.en).toContain("made this a yes");
  });

  it("says NO for a light session (short on 3+ variables)", () => {
    const r = buildSessionEnough({ ...base, players: ["1", "2", "3", "4"].map((id) => player(id, 85, 0.5)) });
    expect(r.verdict).toBe("no");
    expect(r.players.every((p) => p.verdict === "short")).toBe(true);
    expect(r.facts.some((f) => f.en.includes("clearly short"))).toBe(true);
  });

  it("keeps a shortened session out of the team verdict", () => {
    const players = [player("1", 85, 1), player("2", 85, 1), player("3", 85, 1), player("4", 85, 0.2, {}, { partial: true })];
    const r = buildSessionEnough({ ...base, players });
    expect(r.verdict).toBe("yes");
    expect(r.players.find((p) => p.playerId === "4")?.verdict).toBe("partial_session");
    expect(r.confidence.judged).toBe(3);
  });

  it("notes when the session ran well over the day (but still 'enough')", () => {
    const r = buildSessionEnough({ ...base, mdLabel: "MD-1", matchPct: 32, players: ["1", "2", "3"].map((id) => player(id, 32, 1.6)) });
    expect(r.verdict).toBe("yes");
    expect(r.overNote?.en).toContain("MD-1");
  });

  it("describes % of a match without a verdict when there is no MD context", () => {
    const r = buildSessionEnough({ ...base, mdLabel: null, matchPct: null, mdSource: null, players: [player("1", 50, 1)] });
    expect(r.state).toBe("no_md");
    expect(r.verdict).toBeNull();
    expect(r.facts[0].en).toMatch(/% of a match/);
  });

  it("returns match_day / no_reference states", () => {
    expect(buildSessionEnough({ ...base, isMatchDay: true, players: [] }).state).toBe("match_day");
    const noRef = player("1", 85, 1);
    noRef.matchRef = { imaAccel: null, imaDecel: null, imaCod: null, frDistance: null, strideHi: null };
    expect(buildSessionEnough({ ...base, players: [noRef] }).state).toBe("no_reference");
    expect(emptyEnough("not_available").headline.en).toContain("Vector Pro");
  });

  it("adds a week-so-far fact when there are ≥2 sessions since the match", () => {
    const players = ["1", "2", "3"].map((id) => {
      const p = player(id, 85, 1);
      const wk = {} as VarValues;
      for (const k of Object.keys(REF) as Array<keyof VarValues>) wk[k] = (REF[k] as number) * (dayShare(k, 22) + dayShare(k, 85)) * 0.5;
      return { ...p, weekActual: wk };
    });
    const r = buildSessionEnough({ ...base, players, weekDayPcts: [22, 85] });
    expect(r.week?.sessions).toBe(2);
    expect(r.facts.some((f) => f.en.startsWith("Week so far"))).toBe(true);
    expect(r.week?.vars.every((v) => v.status === "well_under")).toBe(true);
  });

  it("falls back to the team reference and lowers confidence", () => {
    const players = ["1", "2", "3", "4"].map((id) => player(id, 85, 1, {}, { refSource: "team", refMatches: 1 }));
    const r = buildSessionEnough({ ...base, players });
    expect(r.confidence.ownRef).toBe(0);
    expect(r.confidence.level).not.toBe("high");
  });
});

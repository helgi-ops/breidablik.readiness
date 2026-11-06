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
    const r = buildSessionEnough({ ...base, players, weekDays: [{ matchPct: 22, dayType: null }, { matchPct: 85, dayType: null }] });
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

import { dayTypeFromText, targetShare, TOPUP_MATCH_PCT } from "@/lib/micropulse/sessionEnough";
import { CAL_SHARE_IMA } from "@/lib/micropulse/periodization/imaStandard";
import { CAL_SHARE_IMA as CAL_FROM_ENGINE } from "@/lib/micropulse/periodization";

/** A player at `fracOfMatch` of a match on Acc/Dec/CoD; running stays on the MD-day target. */
const atMatchShare = (fracOfMatch: number): Partial<VarValues> => ({ imaAccel: REF.imaAccel! * fracOfMatch, imaDecel: REF.imaDecel! * fracOfMatch, imaCod: REF.imaCod! * fracOfMatch });

describe("targetShare — one standard for plan and review", () => {
  it("Acc/Dec/CoD with a day-type read the calendar's table, whatever the MD-day", () => {
    expect(targetShare("imaAccel", 60, "mechanical")).toEqual({ share: 0.8, basis: "day_type" });
    expect(targetShare("imaDecel", 85, "mixed")).toEqual({ share: 0.6, basis: "day_type" });
    expect(targetShare("imaCod", 32, "activation")).toEqual({ share: CAL_SHARE_IMA.activation.cod, basis: "day_type" });
  });
  it("fast running and strides stay on the MD-day, as does everything with no day-type", () => {
    expect(targetShare("frDistance", 60, "mechanical")).toEqual({ share: dayShare("frDistance", 60), basis: "md" });
    expect(targetShare("strideHi", 85, "mixed")).toEqual({ share: dayShare("strideHi", 85), basis: "md" });
    expect(targetShare("imaAccel", 60, null)).toEqual({ share: dayShare("imaAccel", 60), basis: "md" });
  });
  it("the calendar engine exposes the very same table", () => {
    expect(CAL_FROM_ENGINE).toBe(CAL_SHARE_IMA);
  });
});

describe("day-type aware judging", () => {
  it("maps Meso / Week-setup labels to day-types", () => {
    expect(dayTypeFromText("MD-5 Mechanical")).toBe("mechanical");
    expect(dayTypeFromText("FORCE")).toBe("mechanical");
    expect(dayTypeFromText("MD-4 Locomotive")).toBe("locomotive");
    expect(dayTypeFromText("NEURAL / VELOCITY")).toBe("locomotive");
    expect(dayTypeFromText("MD-1 Activation")).toBe("activation");
    expect(dayTypeFromText("MD+1 Top-up")).toBe("topup");
    expect(dayTypeFromText("RECOVERY")).toBe("topup");
    expect(dayTypeFromText("POLISH / CALM")).toBe("mixed");
    expect(dayTypeFromText(null)).toBeNull();
  });

  it("Mechanical day: low running is NOT a fail — judged on accel/decel/CoD only", () => {
    const low = { ...atMatchShare(0.8), frDistance: REF.frDistance! * dayShare("frDistance", 68) * 0.3, strideHi: REF.strideHi! * dayShare("strideHi", 68) * 0.3 };
    const r = buildSessionEnough({ ...base, mdLabel: "MD-4", matchPct: 68, dayType: "mechanical", dayTypeSource: "meso", players: ["1", "2", "3"].map((id) => player(id, 68, 1.0, low)) });
    expect(r.verdict).toBe("yes");
    expect(r.team.find((t) => t.key === "imaAccel")?.targetPct).toBe(80);
    expect(r.team.find((t) => t.key === "imaAccel")?.basis).toBe("day_type");
    expect(r.team.find((t) => t.key === "frDistance")?.basis).toBe("md");
    expect(r.dayType).toBe("mechanical");
    expect(r.focusNote?.en).toMatch(/Mechanical day/);
    expect(r.team.find((t) => t.key === "frDistance")?.focus).toBe(false);
    expect(r.headline.en).toContain("MD-4 Mechanical");
  });

  it("Mechanical day at ~60% of a match reads short on all three, even on a light MD-day", () => {
    const r = buildSessionEnough({ ...base, mdLabel: "MD-5", matchPct: 60, dayType: "mechanical", dayTypeSource: "meso", players: ["1", "2", "3"].map((id) => player(id, 60, 1.0, atMatchShare(0.6))) });
    expect(r.verdict).toBe("no");
    expect(r.team.filter((t) => t.focus).every((t) => t.pctOfTarget === 75)).toBe(true);
    expect(r.facts[0].en).toContain("the day calls for ~80%");
    expect(r.focusNote?.en).toContain("published range 70–90%");
  });

  it("Mixed day on MD-3 at 55% of a match reads on target (the calendar plans 60%, not the MD-day's 85%)", () => {
    const r = buildSessionEnough({ ...base, dayType: "mixed", dayTypeSource: "meso", players: ["1", "2", "3"].map((id) => player(id, 85, 1.0, atMatchShare(0.55))) });
    expect(r.verdict).toBe("yes");
    expect(r.focusNote?.en).toMatch(/Mixed day/);
  });

  it("Locomotive day: Acc/Dec/CoD are context only, whatever they did", () => {
    const r = buildSessionEnough({ ...base, dayType: "locomotive", dayTypeSource: "week_setup", players: ["1", "2", "3"].map((id) => player(id, 85, 1.0, atMatchShare(0.1))) });
    expect(r.verdict).toBe("yes");
    expect(r.team.find((t) => t.key === "imaDecel")?.focus).toBe(false);
  });

  it("week so far sums day-type shares, and a top-up day counts at its MD-day recovery level", () => {
    const days = [{ matchPct: 22, dayType: "topup" as const }, { matchPct: 60, dayType: "mechanical" as const }, { matchPct: 85, dayType: "mixed" as const }];
    const r = buildSessionEnough({ ...base, dayType: "mixed", dayTypeSource: "meso", weekDays: days, players: ["1", "2", "3"].map((id) => ({ ...player(id, 85, 1.0, atMatchShare(0.6)), weekActual: atMatchShare(1.5) as VarValues })) });
    const accel = r.week?.vars.find((v) => v.key === "imaAccel");
    expect(accel?.targetTimesMatch).toBe(Math.round((dayShare("imaAccel", 22) + 0.8 + 0.6) * 10) / 10);
    expect(accel?.timesMatch).toBe(1.5);
  });

  it("Locomotive day: both running types well under → No", () => {
    const low = { frDistance: REF.frDistance! * dayShare("frDistance", 85) * 0.4, strideHi: REF.strideHi! * dayShare("strideHi", 85) * 0.4 };
    const r = buildSessionEnough({ ...base, dayType: "locomotive", dayTypeSource: "week_setup", players: ["1", "2", "3"].map((id) => player(id, 85, 1.0, low)) });
    expect(r.verdict).toBe("no");
    expect(r.team.filter((t) => t.focus).map((t) => t.key)).toEqual(["frDistance", "strideHi"]);
  });

  it("Top-up day: starters recover (not judged), low-minute players judged against the top-up target", () => {
    const players = [
      player("s1", 22, 1.0, {}, { lastMatchMinutes: 90 }),
      player("s2", 22, 1.0, {}, { lastMatchMinutes: 75 }),
      player("b1", TOPUP_MATCH_PCT, 1.0, atMatchShare(0.55), { lastMatchMinutes: 15 }),
      player("b2", TOPUP_MATCH_PCT, 1.0, atMatchShare(0.55), { lastMatchMinutes: 0 }),
    ];
    const r = buildSessionEnough({ ...base, mdLabel: "MD+1", matchPct: 22, dayType: "topup", dayTypeSource: "md", squadSize: 4, players });
    expect(r.players.filter((p) => p.verdict === "recovery").map((p) => p.playerId).sort()).toEqual(["s1", "s2"]);
    expect(r.confidence.judged).toBe(2);
    expect(r.verdict).toBe("yes");
    expect(r.focusNote?.en).toMatch(/2 starters/);
    expect(r.focusNote?.en).toContain("~55% of a match");
    // A recovering starter keeps the MD-day's recovery level, not the top-up target.
    expect(r.players.find((p) => p.playerId === "s1")?.byVar.imaAccel.targetPct).toBe(Math.round(dayShare("imaAccel", 22) * 100));
    expect(r.players.find((p) => p.playerId === "b1")?.byVar.imaAccel.targetPct).toBe(55);
  });
});

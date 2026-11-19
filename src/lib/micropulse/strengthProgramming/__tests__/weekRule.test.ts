/**
 * The week rule (2026-11-19). The unit is heavy lower-body REPETITIONS a week: the rule fixes the day's reps (MD-4,
 * MD-3, and MD-5 when it exists), the method says how many reps a set holds, the sets follow. Contrast rounds follow
 * the heavy lift; a week without a match holds at most three heavy days, never two in a row, and the same reps as a
 * match week. Close to the match: fast work only, 15–20 explosive reps. Individualised modes, football only.
 */
import { describe, expect, it } from "vitest";
import { buildStrengthSession } from "../index";
import { applyBlockToSession } from "../blockEmphasis";
import { sanitizeNoMatchWeek, type StructureKey } from "../structures";
import {
  FRENCH_CONTRAST_MAX_ROUNDS, HEAVY_VELOCITY_LOSS_CAP, MATCH_WEEK_HEAVY_REPS, NEAR_MATCH_LOAD, NEAR_MATCH_REPS, NEAR_MATCH_SETS,
  NO_MATCH_WEEK_HEAVY_TOTAL, applyWeekRule, isHeavyLift, matchWeekHeavyReps, noMatchWeekRule, weekRuleSeasonOf,
} from "../weekRule";
import type { MdContext, PlayerStrengthSnapshot, PrescribedExercise, SessionBlock } from "../types";

const MON = "2026-12-14";
const day = (i: number) => { const d = new Date(`${MON}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); };
const snap = (over: Partial<PlayerStrengthSnapshot> = {}): PlayerStrengthSnapshot => ({
  playerId: "p1", todayIso: MON, mdContext: "MD-4" as MdContext, verdict: "FULL",
  sprintSpeedDropPct: null, sprintExposureBand: null, codAsymmetryPct: null, decelBurdenBand: null, decelBurdenHighStreakDays: 0,
  wellness: { sleepQuality: null, muscleSoreness: null, fatigueEnergy: null, stressMood: null, soreAreas: [] },
  vbtDecrement: null, injuryStatus: "cleared", fosterMonotony: null, fosterStrain: null, isCongestedWeek: false,
  seasonPhase: "preseason", ...over,
});
type S = ReturnType<typeof buildStrengthSession>;
const all = (s: S) => (s?.blocks ?? []).flatMap((b) => b.exercises);
const heavy = (s: S) => all(s).filter(isHeavyLift);
const perSet = (e: PrescribedExercise) => Number(/^\s*(\d+)/.exec(e.dose.reps)![1]);
const heavyReps = (s: S) => heavy(s).reduce((n, e) => n + e.dose.sets * perSet(e), 0);
const rule = (s: S, id: string) => (s?.appliedAdaptations ?? []).find((a) => a.ruleId === id);
/** Methods whose heavy lift is 3 reps a set (contrast, straight sets taken at the lower end of 3–5). */
const THREE_REP_METHODS: StructureKey[] = ["contrast", "straight_sets"];
const HEAVY_METHODS: StructureKey[] = ["contrast", "french_contrast", "straight_sets", "cluster_max_strength"];

/** A hand-built day: one heavy lift with the given reps line, to show how the sets follow the reps. */
const lift = (sets: number, reps: string): PrescribedExercise => ({
  exerciseId: "ex_back_squat", nameEN: "Back squat", nameIS: "Hnébeygja", category: "COMPOUND_STRENGTH",
  dose: { sets, reps, intensity: "85% 1RM", rest: "3 min" },
});
const oneLiftDay = (sets: number, reps: string): SessionBlock[] => [{ id: "b", titleEN: "", titleIS: "", type: "COMPOUND", exercises: [lift(sets, reps)] }];

describe("the numbers, in repetitions", () => {
  it("in season 9 + 6 = 15, pre-season 12 + 9 = 21; MD-5 adds 6", () => {
    expect(MATCH_WEEK_HEAVY_REPS.hold).toEqual({ "MD-5": 6, "MD-4": 9, "MD-3": 6 });
    expect(MATCH_WEEK_HEAVY_REPS.preseason).toEqual({ "MD-5": 6, "MD-4": 12, "MD-3": 9 });
    for (const season of ["hold", "preseason"] as const) {
      const main = (MATCH_WEEK_HEAVY_REPS[season]["MD-4"] ?? 0) + (MATCH_WEEK_HEAVY_REPS[season]["MD-3"] ?? 0);
      expect(main).toBe(NO_MATCH_WEEK_HEAVY_TOTAL[season]);
      // Between the two research anchors: 12 reps a week kept strength (Rønnestad 2011), 32 built it (Helgerud).
      expect(main).toBeGreaterThanOrEqual(12);
      expect(main + (MATCH_WEEK_HEAVY_REPS[season]["MD-5"] ?? 0)).toBeLessThanOrEqual(32);
    }
  });

  it("no heavy reps close to the match or the day after", () => {
    for (const md of ["MD-2", "MD-1", "MD+1", "MD+2", "OFF"] as MdContext[]) {
      expect(matchWeekHeavyReps(md, "preseason")).toBeNull();
      expect(matchWeekHeavyReps(md, "hold")).toBeNull();
    }
  });

  it("the season: pre-season builds, everything else holds", () => {
    expect(weekRuleSeasonOf({ seasonPhase: "preseason" })).toBe("preseason");
    expect(weekRuleSeasonOf({ seasonPhase: "Pre-season" })).toBe("preseason");
    expect(weekRuleSeasonOf({ seasonPhase: "inseason" })).toBe("hold");
    expect(weekRuleSeasonOf({ seasonPhase: "offseason" })).toBe("hold");
    expect(weekRuleSeasonOf({ seasonPhase: null })).toBe("hold");
    // The season plan's phase wins when it is on the snapshot.
    expect(weekRuleSeasonOf({ seasonPhase: "inseason", goalSeason: { phase: "preseason", blockGoal: null } })).toBe("preseason");
    expect(weekRuleSeasonOf({ seasonPhase: "preseason", goalSeason: { phase: "competitive", blockGoal: null } })).toBe("hold");
  });
});

describe("the same reps, whatever the reps a set (the coach's example: 12 reps = 6 × 2 or 3 × 4)", () => {
  it("12 reps: 6 sets of 2, 4 of 3, 3 of 4, 2 of 6", () => {
    for (const [reps, sets] of [["2", 6], ["3", 4], ["4", 3], ["6", 2]] as const) {
      const blocks = oneLiftDay(3, reps);
      const out = applyWeekRule(blocks, 12)!;
      expect(blocks[0].exercises[0].dose.sets, `${reps} reps a set`).toBe(sets);
      expect(out.to).toBe(12);
      expect(out.as).toBe(`${sets} × ${reps}`);
    }
  });

  it("singles and doubles: many short sets, never more than 6 sets of one lift", () => {
    const singles = oneLiftDay(3, "1");
    expect(applyWeekRule(singles, 6)!.as).toBe("6 × 1");
    const capped = oneLiftDay(3, "1");
    expect(applyWeekRule(capped, 12)!.as).toBe("6 × 1"); // 12 singles would be 12 sets: held at 6
    const doubles = oneLiftDay(3, "2");
    expect(applyWeekRule(doubles, 9)!.as).toBe("5 × 2"); // to the nearest set
  });

  it("a range (3–5) is taken at its lower end, so the day's reps are a known number", () => {
    const blocks = oneLiftDay(3, "3-5");
    const out = applyWeekRule(blocks, 9)!;
    expect(blocks[0].exercises[0].dose).toMatchObject({ sets: 3, reps: "3", weekRule: true });
    expect(out).toMatchObject({ from: 9, to: 9, as: "3 × 3" });
  });

  it("two heavy lifts in a day share the day's reps", () => {
    const blocks: SessionBlock[] = [{ id: "b", titleEN: "", titleIS: "", type: "COMPOUND", exercises: [lift(4, "3"), lift(4, "3")] }];
    const out = applyWeekRule(blocks, 12)!;
    expect(out.to).toBe(12);
    expect(out.as).toBe("2 × 3 + 2 × 3");
  });

  it("a day with no heavy lift → nothing to set", () => {
    expect(applyWeekRule(oneLiftDay(3, "12 (6+6, 15s mid-set pause)"), 9)).toBeNull();
    expect(applyWeekRule(oneLiftDay(3, "30s hold"), 9)).toBeNull();
  });
});

describe("a week with a match", () => {
  it("the day's heavy reps come from the rule, whatever the method brings", () => {
    for (const seasonPhase of ["preseason", "inseason"]) {
      const season = seasonPhase === "preseason" ? "preseason" : "hold";
      for (const md of ["MD-5", "MD-4", "MD-3"] as MdContext[]) {
        for (const key of THREE_REP_METHODS) {
          const s = buildStrengthSession(snap({ mdContext: md, seasonPhase, mdStructures: { [md]: key } }));
          if (!s || !heavy(s).length) continue;
          expect(heavyReps(s), `${seasonPhase} ${md} ${key}`).toBe(MATCH_WEEK_HEAVY_REPS[season][md]);
          expect(rule(s, "WEEK_RULE_HEAVY_REPS")?.evidence).toMatch(/MicroPulse's rule, not from a study/);
        }
      }
    }
  });

  it("a method with more reps a set gets fewer sets for the same reps (singles in blocks of 6)", () => {
    // cluster_max_strength: a set is 6 singles. 12 reps → 2 sets (12), not the method's own 4 sets (24).
    const s = buildStrengthSession(snap({ mdContext: "MD-4", mdStructures: { "MD-4": "cluster_max_strength" } }))!;
    expect(heavy(s)[0].dose.sets).toBe(2);
    expect(heavyReps(s)).toBe(12);
    expect(rule(s, "WEEK_RULE_HEAVY_REPS")?.actionEN).toMatch(/12, as 2 × 6 \(the method alone gives 24\)/);
  });

  it("the built-in MD-4 and MD-3 sessions follow the rule too", () => {
    for (const md of ["MD-4", "MD-3"] as MdContext[]) {
      const s = buildStrengthSession(snap({ mdContext: md }));
      if (heavy(s).length) expect(Math.abs(heavyReps(s) - MATCH_WEEK_HEAVY_REPS.preseason[md]!)).toBeLessThanOrEqual(3);
    }
  });

  it("contrast and French contrast: every exercise of the block does the same number of rounds", () => {
    for (const [md, key] of [["MD-5", "contrast"], ["MD-4", "french_contrast"], ["MD-3", "contrast"], ["MD-4", "contrast"]] as const) {
      const s = buildStrengthSession(snap({ mdContext: md, mdStructures: { [md]: key } }))!;
      const block = s.blocks.find((b) => b.type === "FRENCH_CONTRAST" && b.exercises.some(isHeavyLift))!;
      expect(block, `${md} ${key}`).toBeDefined();
      const want = MATCH_WEEK_HEAVY_REPS.preseason[md]! / 3;
      const rounds = new Set(block.exercises.map((e) => e.dose.sets));
      expect([...rounds]).toEqual([key === "french_contrast" ? Math.min(want, FRENCH_CONTRAST_MAX_ROUNDS) : want]);
      if (key === "french_contrast") expect(rule(s, "WEEK_RULE_HEAVY_REPS")?.actionIS).toMatch(/mest 3 hringir/);
      // Studies used 1–5 rounds a session (Lesinski 2014).
      expect(Math.max(...rounds)).toBeLessThanOrEqual(5);
    }
  });

  it("MD-2 and MD-1: no heavy lift there and no heavy-reps line", () => {
    for (const md of ["MD-2", "MD-1"] as MdContext[]) {
      const s = buildStrengthSession(snap({ mdContext: md }));
      expect(rule(s, "WEEK_RULE_HEAVY_REPS")).toBeUndefined();
      expect(heavy(s)).toEqual([]);
    }
  });

  it("a volume method (12-rep cluster) is not a heavy lift: its sets stay the method's", () => {
    const s = buildStrengthSession(snap({ mdStructures: { "MD-4": "cluster_hypertrophy" } }))!;
    expect(heavy(s)).toEqual([]);
    expect(rule(s, "WEEK_RULE_HEAVY_REPS")).toBeUndefined();
  });

  it("standard mode and basketball: as before", () => {
    const std = buildStrengthSession(snap({ mdStructures: { "MD-4": "contrast" } }), [], { mode: "standard" });
    expect(rule(std, "WEEK_RULE_HEAVY_REPS")).toBeUndefined();
    expect(all(std).some((e) => e.dose.weekRule)).toBe(false);
    const bb = buildStrengthSession(snap({ sport: "basketball" }));
    expect(rule(bb, "WEEK_RULE_HEAVY_REPS")).toBeUndefined();
  });

  it("a yellow day still takes sets off: never more than the rule's reps", () => {
    for (const md of ["MD-4", "MD-3"] as MdContext[]) {
      const s = buildStrengthSession(snap({ mdContext: md, verdict: "MODIFIED", mdStructures: { [md]: "contrast" } }));
      if (heavy(s).length) expect(heavyReps(s)).toBeLessThanOrEqual(MATCH_WEEK_HEAVY_REPS.preseason[md]!);
    }
  });

  it("the block: Accumulation adds no set to a rule lift (the week is fixed); Realization may still trim", () => {
    const s = buildStrengthSession(snap({ mdStructures: { "MD-4": "straight_sets" } }))!;
    expect(heavyReps(s)).toBe(12);
    expect(heavyReps(applyBlockToSession(s, "accum", "preseason"))).toBe(12);
    expect(heavyReps(applyBlockToSession(s, "realize", "preseason"))).toBeLessThanOrEqual(12);
    expect(heavyReps(applyBlockToSession(s, "realize", "preseason"))).toBeGreaterThanOrEqual(9);
  });

  it("the whole week: MD-4 + MD-3 = 21 reps in pre-season and 15 in season; with MD-5, 27 and 21", () => {
    const week = (seasonPhase: string, mds: MdContext[], md4: StructureKey) => mds.reduce((n, md) => n + heavyReps(buildStrengthSession(snap({ mdContext: md, seasonPhase, mdStructures: { "MD-5": "contrast", "MD-4": md4, "MD-3": "contrast" } }))), 0);
    expect(week("preseason", ["MD-4", "MD-3"], "contrast")).toBe(21);
    expect(week("inseason", ["MD-4", "MD-3"], "contrast")).toBe(15);
    expect(week("preseason", ["MD-5", "MD-4", "MD-3"], "contrast")).toBe(27);
    expect(week("inseason", ["MD-5", "MD-4", "MD-3"], "contrast")).toBe(21);
    // French contrast on MD-4 (Breiðablik): three rounds at most, so the pre-season week is 18, or 24 with MD-5.
    expect(week("preseason", ["MD-4", "MD-3"], "french_contrast")).toBe(18);
    expect(week("preseason", ["MD-5", "MD-4", "MD-3"], "french_contrast")).toBe(24);
    expect(week("inseason", ["MD-4", "MD-3"], "french_contrast")).toBe(15);
  });
});

describe("within the set, and close to the match", () => {
  const loaded = (s: S) => all(s).filter((e) => e.category === "BALLISTIC" || e.category === "EXPLOSIVE_OLYMPIC");

  it("heavy days: every heavy lift stops the set at a 20% speed loss, never a higher one", () => {
    for (const md of ["MD-5", "MD-4", "MD-3"] as MdContext[]) {
      for (const key of HEAVY_METHODS) {
        const s = buildStrengthSession(snap({ mdContext: md, mdStructures: { [md]: key } }));
        for (const e of heavy(s)) {
          expect(e.dose.velocityLossCap, `${md} ${key}`).toBeTruthy();
          expect(e.dose.velocityLossCap!).toBeLessThanOrEqual(HEAVY_VELOCITY_LOSS_CAP);
        }
        if (heavy(s).length) expect(rule(s, "WEEK_RULE_HEAVY_REPS")?.actionIS).toMatch(/20% hraðatap/);
      }
    }
  });

  it("MD-2 and MD-1: fast work only, 15–20 explosive reps at 30–40%, each set stopped at a 10% speed loss", () => {
    const jumps = (s: S) => all(s).filter((e) => e.category === "PLYOMETRIC" && e.exerciseId !== "mp_pogo_warmup");
    for (const md of ["MD-2", "MD-1"] as MdContext[]) {
      // One loaded lift alone (potentiation cluster): 4 × 4 = 16.
      const pot = buildStrengthSession(snap({ mdContext: md, mdStructures: { [md]: "potentiation_cluster" } }))!;
      const [first, ...rest] = loaded(pot);
      expect(rest).toEqual([]);
      expect([first.dose.sets, first.dose.reps]).toEqual([NEAR_MATCH_SETS, String(NEAR_MATCH_REPS)]);
      expect(first.dose.intensity).toBe(NEAR_MATCH_LOAD);
      expect(first.dose.velocityLossCap).toBe(10);
      expect(rule(pot, "WEEK_RULE_NEAR_MATCH")?.actionEN).toMatch(/4 × 4, 16 explosive reps in all \(the method alone gives 3 × 3\)/);
      // A loaded lift paired with a jump (power contrast): 3 rounds of 3 + 3 = 18, the pair counted together.
      const pc = buildStrengthSession(snap({ mdContext: md, mdStructures: { [md]: "power_contrast" } }))!;
      const block = pc.blocks.find((b) => b.type === "FRENCH_CONTRAST")!;
      expect(block.exercises.map((e) => [e.dose.sets, e.dose.reps])).toEqual([[3, "3"], [3, "3"]]);
      expect(loaded(pc)[0].dose.intensity).toBe(NEAR_MATCH_LOAD);
      expect(loaded(pc)[0].dose.velocityLossCap).toBe(10);
      expect(rule(pc, "WEEK_RULE_NEAR_MATCH")?.actionIS).toMatch(/3 hringir af 3 \+ 3, hlaðna lyftan og svo stökkið, 18 sprengiendurtekningar alls/);
      for (const s of [pot, pc]) {
        const reps = [...loaded(s), ...jumps(s)].reduce((n, e) => n + e.dose.sets * Number(e.dose.reps), 0);
        expect(reps, md).toBeGreaterThanOrEqual(15);
        expect(reps, md).toBeLessThanOrEqual(20);
        expect(heavy(s)).toEqual([]);
        expect(rule(s, "WEEK_RULE_NEAR_MATCH")?.evidence).toMatch(/Harrison 2019/);
        expect(rule(s, "WEEK_RULE_NEAR_MATCH")?.actionIS).toMatch(/10% hraðatap/);
      }
    }
  });

  it("a method with no loaded explosive lift is left as it is (isometric primer, the built-in primer)", () => {
    for (const md of ["MD-2", "MD-1"] as MdContext[]) {
      const builtIn = buildStrengthSession(snap({ mdContext: md }));
      expect(rule(builtIn, "WEEK_RULE_NEAR_MATCH")).toBeUndefined();
      const iso = buildStrengthSession(snap({ mdContext: md, mdStructures: { [md]: "iso_pap_primer" } }));
      expect(rule(iso, "WEEK_RULE_NEAR_MATCH")).toBeUndefined();
      const std = buildStrengthSession(snap({ mdContext: md, mdStructures: { [md]: "potentiation_cluster" } }), [], { mode: "standard" });
      expect(rule(std, "WEEK_RULE_NEAR_MATCH")).toBeUndefined();
    }
  });

  it("a yellow day still takes sets off the near-match dose", () => {
    const s = buildStrengthSession(snap({ mdContext: "MD-1", verdict: "MODIFIED", mdStructures: { "MD-1": "potentiation_cluster" } }));
    for (const e of loaded(s)) expect(e.dose.sets).toBeLessThanOrEqual(NEAR_MATCH_SETS);
  });

  it("a light day in a week without a match takes the same dose", () => {
    const plan = sanitizeNoMatchWeek({ mon: "strength", wed: "power", thu: "light", sat: "strength" });
    const methods = { "MD-4": "french_contrast", "MD-3": "contrast", "MD-2": "power_contrast" } as const;
    for (const i of [1, 3]) { // Tuesday (not in the plan) and Thursday (light)
      const s = buildStrengthSession(snap({ todayIso: day(i), mdContext: "MD-3", noMatchNearby: true, noMatchWeek: plan, mdStructures: methods }))!;
      expect(rule(s, "WEEK_RULE_NEAR_MATCH")?.actionEN).toMatch(/18 explosive reps in all/);
      expect(rule(s, "WEEK_RULE_NEAR_MATCH")?.triggerIS).toMatch(/léttur dagur í viku án leiks/);
    }
  });
});

describe("a week without a match", () => {
  // Breiðablik's shape: strength Mon, power Wed, light Thu, strength Sat; Tue and Fri not in the plan.
  const PLAN = sanitizeNoMatchWeek({ mon: "strength", wed: "power", thu: "light", sat: "strength", sun: "rest" });

  it("pure: at most three heavy days, never two in a row, the week's reps as a match week", () => {
    const r = noMatchWeekRule(MON, PLAN, "preseason")!;
    expect(r.heavyDates).toEqual([day(0), day(2), day(5)]);
    expect(r.weekTotal).toBe(21);
    expect(r.heavyReps).toBe(9); // Monday, a strength day, takes the larger share
    expect(noMatchWeekRule(day(5), PLAN, "preseason")!.heavyReps).toBe(6);
    expect(noMatchWeekRule(day(2), PLAN, "preseason")!.heavyReps).toBe(6);
    // In season: 15 over three days would leave one day with 3 reps; every heavy day keeps at least 6.
    expect(noMatchWeekRule(MON, PLAN, "hold")!.weekTotal).toBe(18);
    // Two heavy days share the week 12 + 9; one heavy day is held at 15.
    const two = sanitizeNoMatchWeek({ mon: "strength", thu: "power" });
    expect([noMatchWeekRule(MON, two, "preseason")!.heavyReps, noMatchWeekRule(day(3), two, "preseason")!.heavyReps]).toEqual([12, 9]);
    expect(noMatchWeekRule(MON, sanitizeNoMatchWeek({ mon: "strength" }), "preseason")!.heavyReps).toBe(15);
  });

  it("pure: a strength day next to a heavy day, or a fourth one, becomes light; a weekday not in the plan is light", () => {
    const five = sanitizeNoMatchWeek({ mon: "strength", tue: "strength", wed: "strength", thu: "power", fri: "strength" });
    const roles = [0, 1, 2, 3, 4].map((i) => noMatchWeekRule(day(i), five, "preseason")!);
    expect(roles.map((r) => r.kind)).toEqual(["strength", "light", "strength", "light", "strength"]);
    expect(roles[1].lightBecause).toBe("next_to_heavy");
    expect(roles[0].heavyDates.length).toBe(3);
    expect(noMatchWeekRule(day(1), PLAN, "preseason")).toMatchObject({ kind: "light", heavyReps: null, lightBecause: "not_in_plan" });
    expect(noMatchWeekRule(day(6), PLAN, "preseason")!.kind).toBe("rest");
    expect(noMatchWeekRule(day(3), PLAN, "preseason")).toMatchObject({ kind: "light", lightBecause: null });
    // No plan at all → no rule (built as before).
    expect(noMatchWeekRule(MON, {}, "preseason")).toBeNull();
    expect(noMatchWeekRule(MON, undefined, "preseason")).toBeNull();
  });

  it("the engine: the week's heavy reps are 21 in pre-season, on three days; the other days are light", () => {
    const methods = { "MD-4": "french_contrast", "MD-3": "contrast", "MD-2": "power_contrast" } as const;
    const build = (i: number) => buildStrengthSession(snap({ todayIso: day(i), mdContext: "MD-3", noMatchNearby: true, noMatchWeek: PLAN, mdStructures: methods }));
    const week = [0, 1, 2, 3, 4, 5, 6].map(build);
    expect(week.map((s) => s?.mdContext ?? null)).toEqual(["MD-4", "MD-2", "MD-3", "MD-2", "MD-2", "MD-4", null]);
    expect(week.map((s) => heavyReps(s))).toEqual([9, 0, 6, 0, 0, 6, 0]);
    expect(week.filter((s) => heavy(s).length).length).toBe(3);
    // Tuesday and Friday are not in the plan: a light day with the reason, not a full MD-3 session as before.
    expect(rule(week[1], "WEEK_RULE_LIGHT_DAY")?.triggerIS).toMatch(/ekki í vikuplaninu/);
    expect(rule(week[4], "WEEK_RULE_LIGHT_DAY")).toBeTruthy();
    expect(rule(week[0], "WEEK_RULE_HEAVY_REPS")?.triggerEN).toMatch(/21 heavy reps this week on 3 days/);
    // Injury prevention rides on the heavy days only: at most three sessions, never two days in a row.
    const nordicDays = week.map((s, i) => (all(s).some((e) => e.exerciseId === "ex_nordic_curl") ? i : -1)).filter((i) => i >= 0);
    expect(nordicDays.length).toBeLessThanOrEqual(3);
    for (let k = 1; k < nordicDays.length; k++) expect(nordicDays[k] - nordicDays[k - 1]).toBeGreaterThanOrEqual(2);
  });

  it("a team with no weekday plan is built as before", () => {
    const a = buildStrengthSession(snap({ mdContext: "MD-3", noMatchNearby: true }));
    expect(rule(a, "WEEK_RULE_HEAVY_REPS")).toBeUndefined();
    expect(rule(a, "WEEK_RULE_LIGHT_DAY")).toBeUndefined();
  });
});

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { allowedLevels, allowedStarts, buildGoalPlan, ruleStart } from "../index";
import {
  GYM_REFS,
  explosiveWeeks,
  maxStrengthWeeks,
  strengthPowerWeeks,
  type ExplosiveStart,
  type MaxStrengthStart,
  type StrengthPowerStart,
} from "../gymGoals";
import { RX_REFS, goalPlanWithRx } from "../liftRx";
import { GYM_ONLY_QUALITIES, OPEN_GOAL_QUALITIES, isOpenGoalQuality, type GoalPlan, type GoalPlanInput, type GymQuality } from "../types";
import { TRAINING_LEVELS } from "../levels";

/** The gym-only goals (2026-11-18): Maximal strength, Explosive power, Strength + power. */

const base = (over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
  quality: "max_strength",
  todayIso: "2026-11-18",
  sport: "football",
  isGoalkeeper: false,
  isActive: true,
  ageYears: 24,
  unavailable: false,
  inSeason: false,
  topSpeed: null,
  sprintTimes: null,
  cmj: null,
  strength: null,
  braking: null,
  weakerLeg: null,
  ...over,
});

type Strength = NonNullable<GoalPlanInput["strength"]>;
const str = (imtpBand: Strength["imtpBand"], dsiTier: Strength["dsiTier"]): Strength => ({
  imtpRelNkg: imtpBand ? 40 : null,
  imtpBand,
  dsiTier,
  dsiBasis: dsiTier ? "squad" : null,
  date: "2026-10-01",
});

const blocks = (p: GoalPlan) => p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks));
const pcts = (p: GoalPlan) => blocks(p).flatMap((b) => [...b.dose.en.matchAll(/(\d+)–(\d+)% of max/g)].map((m) => Number(m[2])));

function every(q: GymQuality): GoalPlan[] {
  const out: GoalPlan[] = [];
  const shapes: Array<Strength | null> = [null, str("below", null), str("good", "ballistic"), str(null, "max_strength"), str("average", "concurrent"), str("elite", "max_strength")];
  for (const s of shapes) for (const age of [24, 16, null]) for (const inSeason of [true, false]) for (const level of TRAINING_LEVELS) {
    const input = base({ quality: q, strength: s, ageYears: age, inSeason, level });
    for (const st of allowedStarts(input)) out.push(buildGoalPlan({ ...input, startOverride: st.key }));
  }
  return out;
}
const ALL = GYM_ONLY_QUALITIES.flatMap(every);

describe("gym-only goals: who and when", () => {
  it("are open to players and coaches since their delivery shipped (step 2)", () => {
    for (const q of GYM_ONLY_QUALITIES) {
      expect(OPEN_GOAL_QUALITIES).toContain(q);
      expect(isOpenGoalQuality(q)).toBe(true);
    }
    expect(isOpenGoalQuality("jump")).toBe(true);
  });
  it("goalkeepers and basketball players get them (only top speed is blocked for them)", () => {
    for (const q of GYM_ONLY_QUALITIES) {
      expect(buildGoalPlan(base({ quality: q, isGoalkeeper: true })).status).toBe("ok");
      expect(buildGoalPlan(base({ quality: q, sport: "basketball" })).status).toBe("ok");
      expect(buildGoalPlan(base({ quality: q, unavailable: true })).blocked?.reason).toBe("injured_or_rtt");
    }
  });
  it("two goal days a week, in season and out", () => {
    for (const p of ALL) {
      expect(p.sessionsPerWeek).toBe(2);
      for (const w of p.weeks) expect(w.sessions.map((s) => s.slot)).toEqual(["A", "B"]);
    }
  });
  it("every plan says what holds in season", () => {
    for (const p of ALL) expect(p.safety.some((s) => /In season the team's own session holds/.test(s.en))).toBe(true);
  });
});

describe("gym-only goals: starts (strength test first, then DSI)", () => {
  const start = (quality: GymQuality, s: Strength | null, ageYears: number | null = 24) => ruleStart(base({ quality, strength: s, ageYears }));
  it("Explosive power: weak pull → strength first; strong pull → power; no pull test + high DSI → strength first", () => {
    expect(start("explosive", str("below", null))).toBe("strength_first");
    expect(start("explosive", str("average", "ballistic"))).toBe("strength_first");
    expect(start("explosive", str("good", "max_strength"))).toBe("power");
    expect(start("explosive", str(null, "max_strength"))).toBe("strength_first");
    expect(start("explosive", str(null, "ballistic"))).toBe("power");
    expect(start("explosive", null)).toBe("power");
  });
  it("Strength + power: low DSI with a weak pull is strength-led (Suchomel 2020's case), with a strong pull power-led", () => {
    expect(start("strength_power", str("below", "ballistic"))).toBe("strength_led");
    expect(start("strength_power", str("good", "ballistic"))).toBe("power_led");
    expect(start("strength_power", str("elite", "ballistic"))).toBe("power_led");
    expect(start("strength_power", str(null, "ballistic"))).toBe("power_led");
    expect(start("strength_power", str("good", "max_strength"))).toBe("strength_led");
    expect(start("strength_power", str("good", "concurrent"))).toBe("even");
    expect(start("strength_power", null)).toBe("even");
  });
  it("under 18 or age unknown: the youth start only, no level choice", () => {
    for (const q of GYM_ONLY_QUALITIES) for (const age of [16, null]) {
      expect(start(q, str("elite", "ballistic"), age)).toBe("youth");
      expect(allowedStarts(base({ quality: q, ageYears: age })).map((s) => s.key)).toEqual(["youth"]);
      expect(allowedLevels(base({ quality: q, ageYears: age }))).toEqual([]);
    }
  });
  it("every ok plan has a counterfactual and names missing data when there is none", () => {
    for (const p of ALL) expect(p.counterfactual ?? p.startOverride).not.toBeNull();
    for (const q of GYM_ONLY_QUALITIES) {
      const p = buildGoalPlan(base({ quality: q }));
      expect(p.confidence.level).toBe("low");
      expect(p.confidence.missing.length).toBeGreaterThan(0);
    }
  });
});

describe("gym-only goals: old force-plate tests", () => {
  it("a strength-to-jump ratio older than 12 months is not used, and the plan asks for a new test", () => {
    const old = { ...str(null, "ballistic"), date: "2024-12-04" };
    expect(ruleStart(base({ quality: "strength_power", strength: old }))).toBe("even");
    expect(ruleStart(base({ quality: "explosive", strength: { ...old, dsiTier: "max_strength" } }))).toBe("power");
    const p = buildGoalPlan(base({ quality: "strength_power", strength: old }));
    expect(p.confidence.missing.some((m) => /older than 12 months/.test(m.en))).toBe(true);
    expect(p.confidence.used).toHaveLength(0);
  });
});

describe("gym-only goals: doses", () => {
  it("never above 90% of max; beginner never above 85%; under 18 never above 75%", () => {
    for (const p of ALL) {
      const top = Math.max(0, ...pcts(p));
      expect(top).toBeLessThanOrEqual(90);
      if (p.level === "beginner") expect(top).toBeLessThanOrEqual(85);
      if (p.youthLevel) expect(top).toBeLessThanOrEqual(75);
    }
  });
  it("under 18: no loaded jump squats, no heavy lift test, a coach at every block", () => {
    for (const p of ALL.filter((x) => x.youthLevel)) for (const b of blocks(p)) {
      expect(b.what.en).not.toBe("Light jump squats");
      expect(b.what.en).not.toBe("Strength test");
      expect(b.supervised).toBe(true);
    }
  });
  it("power before strength in every session (tests first)", () => {
    for (const p of ALL) for (const w of p.weeks) for (const s of w.sessions) {
      const kinds = s.blocks.filter((b) => !b.test).map((b) => (b.method === "jump_squat" ? "power" : "strength"));
      const firstStrength = kinds.indexOf("strength");
      if (firstStrength >= 0) expect(kinds.slice(firstStrength)).not.toContain("power");
    }
  });
  it("week 7 eases off and the test weeks hold a test", () => {
    for (const p of ALL) {
      expect(p.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(p.weeks[6].label.en).toMatch(/ease off/);
      for (const tw of p.tests.weeks) expect(p.weeks[tw - 1].sessions[0].blocks.some((b) => b.test)).toBe(true);
    }
  });
  it("every lift line is readable by the rx reader (each non-test block gets its variables)", () => {
    for (const p of ALL) for (const b of blocks(goalPlanWithRx(p))) if (!b.test) expect(b.rx?.length ?? 0, `${p.quality} ${b.what.en}`).toBeGreaterThan(0);
  });
  it("advanced adds sets, never load", () => {
    const sets = (p: GoalPlan) => blocks(p).reduce((n, b) => n + Number(/^(?:Squat or trap-bar deadlift )?(\d+)/.exec(b.dose.en)?.[1] ?? 0), 0);
    for (const q of GYM_ONLY_QUALITIES) {
      const mid = buildGoalPlan(base({ quality: q, level: "intermediate" }));
      const adv = buildGoalPlan(base({ quality: q, level: "advanced" }));
      expect(sets(adv)).toBeGreaterThan(sets(mid));
      expect(Math.max(...pcts(adv))).toBe(Math.max(...pcts(mid)));
    }
  });
  it("the copied sources are identical to the lift reader's", () => {
    expect(GYM_REFS.cuthbert2021).toEqual(RX_REFS.cuthbert2021);
    expect(GYM_REFS.cormie2007).toEqual(RX_REFS.cormie2007);
    expect(RX_REFS.cormie2010a).toEqual(GYM_REFS.cormie2010a);
  });
});

/** Golden copy (2026-11-18): if a hash changes, the change was meant (bump GOAL_CONTENT_VERSION) or it is a bug.
 *  Changed on purpose: 2026-11-23 (GOAL_CONTENT_VERSION 2026-11-23.1, brief §4a) — Maximal strength's heavy day adds an
 *  isometric pull and a one-leg lift; Explosive power adds a fast isometric pull and low drop jumps (20–30 cm). Youth
 *  and Strength + power unchanged. */
const h = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
const GOLDEN: Record<string, string> = {
  "max_strength:youth": "364ef5aee50a1b0a",
  "max_strength:heavy": "fe3aeb20d528fd14",
  "explosive:youth": "c843a6a2edc1d417",
  "explosive:strength_first": "ab6b5dbe374f1fc2",
  "explosive:power": "16e435f5c6a23f41",
  "strength_power:youth": "c843a6a2edc1d417",
  "strength_power:strength_led": "baf7fd60e9411004",
  "strength_power:even": "344438b652d72d2e",
  "strength_power:power_led": "22aec8271d4e8798",
};

describe("gym-only goals: golden weeks", () => {
  it("the intermediate plans are pinned", () => {
    const now: Record<string, string> = {};
    for (const s of ["youth", "heavy"] as MaxStrengthStart[]) now[`max_strength:${s}`] = h(maxStrengthWeeks(s));
    for (const s of ["youth", "strength_first", "power"] as ExplosiveStart[]) now[`explosive:${s}`] = h(explosiveWeeks(s));
    for (const s of ["youth", "strength_led", "even", "power_led"] as StrengthPowerStart[]) now[`strength_power:${s}`] = h(strengthPowerWeeks(s));
    expect(now).toEqual(GOLDEN);
  });
});

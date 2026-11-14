import { describe, expect, it } from "vitest";
import { individualPlan, individualStarts, qualityPlan, QUALITY_PLAN_KEYS } from "../qualityPlans";
import { SPEED_METHODS, speedPlan } from "../../speedMethods";
import { QUALITY_LIBRARIES } from "../qualityLibrary";
import { buildGoalPlan } from "../index";
import { TRAINING_LEVELS, type TrainingLevel } from "../levels";
import { RX_REFS, distinctLifts, goalPlanWithRx, rxForBlock, rxRefsUsed, withRx, type LiftRx, type RxContext, type RxLine } from "../liftRx";
import { applySwaps, type SwapChoices } from "../swaps";
import type { Bi, GoalPlanInput, GoalQuality } from "../types";
import { GOAL_QUALITIES } from "../types";

/**
 * Lota 7: every gym lift carries its full set of variables, read from the block itself. The plan's text never
 * changes; every number names where it comes from.
 */

type AnyBlock = { method: string; what: Bi; dose: Bi; test?: boolean; rx?: LiftRx[] } & Record<string, unknown>;
type AnyPlan = { weeks: { sessions: { blocks: AnyBlock[] }[] }[] };
type Case = { name: string; ctx: RxContext; plan: AnyPlan };

const LIB_QUALITIES = ["acceleration", "braking", "jump"] as const;
const CASES: Case[] = [];
for (const lv of TRAINING_LEVELS) {
  for (const q of LIB_QUALITIES) {
    for (const key of QUALITY_PLAN_KEYS) if (key !== "individual") CASES.push({ name: `${q}:${key}:${lv}`, ctx: { quality: q, level: lv, youth: false }, plan: qualityPlan(q, key, null, lv) as unknown as AnyPlan });
    for (const s of individualStarts(q, lv)) CASES.push({ name: `${q}:ind:${s.key}:${lv}`, ctx: { quality: q, level: lv, youth: s.key === "youth" }, plan: individualPlan(q, s.key, lv) as unknown as AnyPlan });
  }
  for (const key of ["in_season", "pre_season", "individual"] as const) CASES.push({ name: `top:${key}:${lv}`, ctx: { quality: "top_speed", level: lv, youth: false }, plan: speedPlan(key, lv) as unknown as AnyPlan });
}
const RX = CASES.map((c) => ({ ...c, out: withRx(c.plan, c.ctx) }));
const blocks = (p: AnyPlan) => p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks));
const allLines = (r: LiftRx): RxLine[] => [...Object.values(r.rows).filter((l): l is RxLine => l != null), ...r.barSpeed.map((x) => x.line)];

const GYM_METHODS = new Set(["heavy_strength", "jump_squat", "nordic", "eccentric_strength", "squat_bar_speed"]);
const NEED_ROWS = ["order", "load", "effort", "tempo", "rest", "warmup", "progression", "frequency"] as const;

const base = (over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
  quality: "acceleration", todayIso: "2026-11-14", sport: "football", isGoalkeeper: false, isActive: true, ageYears: 24,
  unavailable: false, inSeason: false, topSpeed: null, sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null,
  ...over,
});

describe("every gym lift gets its full set of variables (lota 7)", () => {
  it("gym blocks get rx; sprints, unloaded jumps and tests get none; what and dose never change", () => {
    let lifts = 0;
    for (const { name, plan, out } of RX) {
      const a = blocks(plan);
      blocks(out).forEach((b, i) => {
        expect(b.what, name).toEqual(a[i].what);
        expect(b.dose, name).toEqual(a[i].dose);
        if (GYM_METHODS.has(b.method) && /\d\s*×\s*\d/.test(b.dose.en)) {
          expect(b.rx?.length, `${name}: ${b.what.en} · ${b.dose.en}`).toBeGreaterThan(0);
          lifts += b.rx!.length;
        } else {
          expect(b.rx, `${name}: ${b.method}`).toBeUndefined();
        }
      });
    }
    expect(lifts).toBeGreaterThan(200);
  });

  it("each lift has every row and at least one bar-speed line, in both languages", () => {
    for (const { name, out } of RX) for (const b of blocks(out)) for (const r of b.rx ?? []) {
      for (const k of NEED_ROWS) expect(r.rows[k], `${name}: ${r.exercise.en} ${k}`).toBeDefined();
      expect(r.barSpeed.length, `${name}: ${r.exercise.en}`).toBeGreaterThan(0);
      expect(r.exercise.is).not.toBe("");
      for (const l of allLines(r)) {
        expect(l.text.en.length).toBeGreaterThan(3);
        expect(l.text.is.length).toBeGreaterThan(3);
        expect(l.text.is).not.toBe(l.text.en);
      }
    }
  });

  it("sets × reps in rx are the ones in the dose line", () => {
    for (const { name, out } of RX) for (const b of blocks(out)) for (const r of b.rx ?? []) {
      expect(b.dose.en, name).toContain(`${r.sets} × ${r.reps}`);
    }
  });

  it("a % of max or a rest written in the dose is the same in rx", () => {
    for (const { name, out } of RX) for (const b of blocks(out)) for (const r of b.rx ?? []) {
      const seg = b.dose.en.split(" · ").find((s) => s.includes(`${r.sets} × ${r.reps}`)) ?? "";
      const pct = /(\d+–\d+)% of max/.exec(seg)?.[1];
      if (pct && r.profile === "heavy" && !(r.sets === "2" && r.reps === "3")) expect(r.rows.load!.text.en, name).toContain(`${pct}%`);
      const rest = /(\d+(?:–\d+)?) min rest/.exec(seg)?.[1];
      if (rest) expect(r.rows.rest!.text.en, name).toContain(`${rest} min`);
    }
  });

  it("every line names its source; study lines cite papers read in full, MicroPulse lines cite none", () => {
    for (const { name, out } of RX) for (const b of blocks(out)) for (const r of b.rx ?? []) for (const l of allLines(r)) {
      expect(["plan_study", "other_study", "micropulse"]).toContain(l.source);
      if (l.source === "micropulse") {
        expect(l.refs ?? [], name).toEqual([]);
      } else {
        expect(l.refs?.length, `${name}: ${l.text.en}`).toBeGreaterThan(0);
        for (const k of l.refs!) {
          expect(RX_REFS[k], k).toBeDefined();
          expect(RX_REFS[k].verifiedFrom, k).toBe("full_text");
        }
      }
    }
  });

  it("'from the studies behind this method' only when the method's own card cites that study", () => {
    const cardRefs = (q: GoalQuality, method: string) =>
      new Set<string>(
        (q === "top_speed" ? SPEED_METHODS.find((m) => m.key === method)?.findings : QUALITY_LIBRARIES[q].methods.find((m) => m.key === method)?.findings)?.map((f) => f.ref as string) ?? [],
      );
    for (const { ctx, out } of RX) for (const b of blocks(out)) for (const r of b.rx ?? []) {
      const refs = cardRefs(ctx.quality, r.profile === "pull" ? "pulling_derivatives" : b.method);
      for (const l of allLines(r)) {
        if (l.source === "plan_study") expect(l.refs!.some((k) => refs.has(k))).toBe(true);
        if (l.source === "other_study") expect(l.refs!.some((k) => refs.has(k))).toBe(false);
      }
    }
  });

  it("no target speed in m/s for jump squats (no study tested one)", () => {
    for (const { out } of RX) for (const b of blocks(out)) for (const r of b.rx ?? []) {
      if (r.profile !== "jump_squat") continue;
      for (const l of allLines(r)) expect(l.text.en).not.toMatch(/\d\s*m\/s/);
    }
  });

  it("under 18: no load line above 75% of max", () => {
    let youthLifts = 0;
    for (const { ctx, out } of RX) {
      if (!ctx.youth) continue;
      for (const b of blocks(out)) for (const r of b.rx ?? []) {
        youthLifts++;
        const nums = [...r.rows.load!.text.en.matchAll(/(\d+)(?:–(\d+))?% of max/g)].map((m) => Number(m[2] ?? m[1]));
        for (const n of nums) expect(n, r.rows.load!.text.en).toBeLessThanOrEqual(75);
        expect(r.profile).not.toBe("heavy");
      }
    }
    expect(youthLifts).toBeGreaterThan(0);
  });

  it("plain words: no RIR / RPE / VBT, no injury promises, no placeholders", () => {
    for (const { out } of RX) for (const b of blocks(out)) for (const r of b.rx ?? []) for (const l of allLines(r)) {
      for (const t of [l.text.en, l.text.is]) {
        expect(t).not.toMatch(/\b(RIR|RPE|VBT|1RM)\b/);
        expect(t).not.toMatch(/prevent|injur|meiðsl/i);
        expect(t).not.toMatch(/\((ur|n|i|a)\)/);
      }
    }
  });

  it("order says power first, strength after when a fast lift comes before a heavy one", () => {
    let seen = 0;
    for (const { out } of RX) for (const w of out.weeks) for (const s of w.sessions) {
      const lifts = s.blocks.flatMap((b) => b.rx ?? []);
      const firstPower = lifts.findIndex((r) => ["jump_squat", "pull", "squat_fast"].includes(r.profile));
      lifts.forEach((r, i) => {
        expect(r.rows.order!.text.en).toMatch(new RegExp(`^${i + 1} of ${lifts.length} in the gym`));
        if (firstPower >= 0 && i > firstPower && ["heavy", "technique", "rdl", "nordic", "eccentric"].includes(r.profile)) {
          expect(r.rows.order!.text.en).toMatch(/power first, strength after/);
          seen++;
        }
      });
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("the fast squat keeps the tested programme's numbers: 4 min rest, 15% speed loss, its bar speeds", () => {
    const jump = RX.find((c) => c.name === "jump:in_season:intermediate")!;
    const fast = blocks(jump.out).flatMap((b) => b.rx ?? []).filter((r) => r.profile === "squat_fast");
    expect(fast.length).toBeGreaterThan(0);
    for (const r of fast) {
      expect(r.rows.rest!.text.en).toMatch(/^4 min/);
      expect(r.barSpeed.find((x) => x.key === "stop")!.line.text.en).toMatch(/15%/);
    }
    const one = rxForBlock({ method: "squat_bar_speed", what: { en: "Full squat, moved fast", is: "Full hnébeygja, hreyfð hratt" }, dose: { en: "3 × 6, fast (bar about 1.0 m/s)", is: "3 × 6, hratt (stöngin um 1,0 m/s)" } }, { quality: "jump", level: "intermediate", youth: false })[0];
    expect(one.rows.load!.text.en).toMatch(/55–60% of max/);
    expect(one.barSpeed.find((x) => x.key === "target")!.line.text.en).toMatch(/1\.0 m\/s/);
    expect(one.barSpeed.find((x) => x.key === "target")!.line.text.is).toMatch(/1,0 m\/s/);
  });

  it("swaps: a pull gets the pulls' load; leg press and dumbbells say the device is not used", () => {
    const acc = qualityPlan("acceleration", "in_season", null, "intermediate");
    const pulls = withRx(applySwaps(acc, "acceleration", { jump_squat_load: "jump_shrug" } as SwapChoices), { quality: "acceleration", level: "intermediate", youth: false }) as unknown as AnyPlan;
    const p = blocks(pulls).flatMap((b) => b.rx ?? []).filter((r) => r.profile === "pull");
    expect(p.length).toBeGreaterThan(0);
    expect(p[0].exercise.en).toBe("Jump shrugs");
    expect(p[0].rows.load!.text.en).toMatch(/30–45% of a hang power clean max/);
    const lp = withRx(applySwaps(acc, "acceleration", { heavy_legs: "leg_press" } as SwapChoices), { quality: "acceleration", level: "intermediate", youth: false }) as unknown as AnyPlan;
    const legPress = blocks(lp).flatMap((b) => b.rx ?? []).filter((r) => r.exercise.en === "Leg press");
    expect(legPress.length).toBeGreaterThan(0);
    for (const r of legPress) expect(r.barSpeed.map((x) => x.key)).toEqual(["none"]);
    const db = withRx(applySwaps(acc, "acceleration", { jump_squat_load: "dumbbells" } as SwapChoices), { quality: "acceleration", level: "intermediate", youth: false }) as unknown as AnyPlan;
    for (const r of blocks(db).flatMap((b) => b.rx ?? []).filter((x) => x.profile === "jump_squat")) expect(r.barSpeed.map((x) => x.key)).toEqual(["none"]);
  });

  it("top speed 'heavy' with no % in the dose reads the level: 75–85% intermediate, 80–90% advanced", () => {
    const pick = (lv: TrainingLevel) =>
      blocks(withRx(speedPlan("in_season", lv), { quality: "top_speed", level: lv, youth: false }) as unknown as AnyPlan).flatMap((b) => b.rx ?? []).find((r) => r.profile === "heavy")!;
    expect(pick("intermediate").rows.load!.text.en).toMatch(/75–85%/);
    expect(pick("advanced").rows.load!.text.en).toMatch(/80–90%/);
  });

  it("the PDF list has each distinct lift once and every source it cites", () => {
    const out = RX.find((c) => c.name === "top:pre_season:intermediate")!.out;
    const lifts = distinctLifts(out);
    const keys = new Set(lifts.map((r) => JSON.stringify([r.exercise.en, r.rows.load?.text.en])));
    expect(keys.size).toBe(lifts.length);
    const refs = rxRefsUsed(lifts).map((r) => r.key);
    for (const r of lifts) for (const l of allLines(r)) for (const k of l.refs ?? []) expect(refs).toContain(k);
  });
});

describe("goal plans carry rx (lota 7)", () => {
  it("the stored plan never holds rx (it would triple its size); reading it adds rx to the gym blocks", () => {
    for (const q of GOAL_QUALITIES) {
      const stored = buildGoalPlan(base({ quality: q, weakerLeg: q === "braking" ? { side: "left", asymPct: 12, test: "nordbord", date: null } : null }));
      expect(stored.status, q).toBe("ok");
      expect(JSON.stringify(stored), q).not.toContain('"rx"');
      const read = goalPlanWithRx(stored);
      const gym = read.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks)).filter((b) => b.rx?.length);
      expect(gym.length, q).toBeGreaterThan(0);
      expect(read.weeks.map((w) => w.sessions.map((s) => s.blocks.map((b) => b.dose)))).toEqual(stored.weeks.map((w) => w.sessions.map((s) => s.blocks.map((b) => b.dose))));
    }
  });

  it("under 18, the goal plan's lifts never go above 75% of max", () => {
    for (const q of GOAL_QUALITIES) {
      const plan = goalPlanWithRx(buildGoalPlan(base({ quality: q, ageYears: 16, weakerLeg: q === "braking" ? { side: "left", asymPct: 12, test: "nordbord", date: null } : null })));
      expect(plan.youthLevel).toBe(true);
      for (const b of plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks))) for (const r of b.rx ?? []) {
        const nums = [...r.rows.load!.text.en.matchAll(/(\d+)(?:–(\d+))?% of max/g)].map((m) => Number(m[2] ?? m[1]));
        for (const n of nums) expect(n).toBeLessThanOrEqual(75);
      }
    }
  });
});

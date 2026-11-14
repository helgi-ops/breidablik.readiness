import { describe, expect, it } from "vitest";
import { allQualityPlans } from "../qualityPlans";
import { allSpeedPlans, SPEED_METHOD_BY_KEY, SPEED_REFS } from "../../speedMethods";
import { ACCEL_METHODS, ACCEL_REFS, PULLING_DERIVATIVES } from "../acceleration";
import { JUMP_METHODS, JUMP_REFS } from "../jump";
import { buildGoalPlan } from "../index";
import { ADULT_ONLY_SWAPS, SWAP_SLOT_BY_KEY, SWAP_SLOTS, applySwaps, swapMark, type SwapChoices } from "../swaps";
import type { Bi, GoalPlanInput, GoalQuality } from "../types";
import { GOAL_QUALITIES } from "../types";

/**
 * Lota 6: bar speed (VBT) on the method cards and weightlifting pulls as a card + a swap for the light jump squats.
 * No plan's numbers change; pulls never stand in for jumps, bounds, tests or youth blocks.
 */

type AnyBlock = { method: string; what: Bi; dose: Bi; test?: boolean } & Record<string, unknown>;
type AnyPlan = { weeks: { sessions: { blocks: AnyBlock[] }[] }[] };
const PLANS: { quality: GoalQuality; plan: AnyPlan; youth: boolean }[] = [
  ...allQualityPlans().map((p) => ({ quality: p.quality as GoalQuality, plan: p as unknown as AnyPlan, youth: /youth/.test(JSON.stringify(p.key ?? "")) })),
  ...allSpeedPlans().map((p) => ({ quality: "top_speed" as GoalQuality, plan: p as unknown as AnyPlan, youth: false })),
];
const blocks = (p: AnyPlan) => p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks));
const PULLS: string[] = [...ADULT_ONLY_SWAPS];
const JUMP_OR_TEST = new Set(["rebound_jumps", "drop_jumps", "squat_cmj_jumps", "youth_hops", "plyometrics", "bounds", "landing_drills", "decel_technique", "flying_sprints", "accel_sprints", "resisted_sled"]);

const base = (over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
  quality: "acceleration", todayIso: "2026-11-13", sport: "football", isGoalkeeper: false, isActive: true, ageYears: 24,
  unavailable: false, inSeason: false, topSpeed: null, sprintTimes: null, cmj: null, strength: null, braking: null, weakerLeg: null,
  ...over,
});

describe("weightlifting pulls as a swap (lota 6)", () => {
  it("the pulls are options only for the light jump squats, each with a 'teach it first' note", () => {
    for (const s of SWAP_SLOTS) for (const o of s.options) {
      if (PULLS.includes(o.key)) {
        expect(s.key).toBe("jump_squat_load");
        expect(o.note?.en).toMatch(/Teach it first/);
        expect(o.note?.is).toMatch(/Kenndu hana fyrst/);
      }
    }
    expect(SWAP_SLOT_BY_KEY.jump_squat_load.options.map((o) => o.key)).toEqual(expect.arrayContaining(PULLS));
  });

  it("a pull swap only ever changes jump squat blocks: never jumps, bounds, sprints, tests or youth blocks", () => {
    let changed = 0;
    for (const { quality, plan } of PLANS) for (const key of PULLS) {
      const out = applySwaps(plan as never, quality, { jump_squat_load: key } as SwapChoices) as unknown as AnyPlan;
      const a = blocks(plan);
      blocks(out).forEach((b, i) => {
        const m = swapMark(b);
        if (!m?.swapped) return;
        changed++;
        expect(m.slot).toBe("jump_squat_load");
        expect(a[i].what.en).toBe("Light jump squats");
        expect(JUMP_OR_TEST.has(b.method)).toBe(false);
        expect(b.test).not.toBe(true);
        expect(b.supervised === true && b.method === "youth_hops").toBe(false);
      });
    }
    expect(changed).toBeGreaterThan(10);
  });

  it("under-18 goal plans never get a pull, even when the team chose one (top speed has jump squats at the youth level)", () => {
    for (const q of GOAL_QUALITIES) for (const age of [16, null]) {
      const input = base({ quality: q, ageYears: age });
      const plain = buildGoalPlan(input);
      for (const opt of ADULT_ONLY_SWAPS) {
        const p = buildGoalPlan({ ...input, swaps: { jump_squat_load: opt } });
        expect(p.weeks, `${q} ${age} ${opt}`).toEqual(plain.weeks);
        expect(p.swaps ?? {}).toEqual({});
      }
      // Other team swaps still apply to youth (the bar or dumbbells are not pulls).
      const bar = buildGoalPlan({ ...input, swaps: { jump_squat_load: "bar" } });
      if (q === "top_speed") expect(bar.swaps).toEqual({ jump_squat_load: "bar" });
    }
  });

  it("in an adult goal plan the pull keeps the jump squats' sets and reps", () => {
    const input = base({ quality: "top_speed", topSpeed: { level: "ok", daysSince: 4, refKmh: 32, targetKmh: 28.8, confidence: "high" } });
    const plain = buildGoalPlan(input);
    const p = buildGoalPlan({ ...input, swaps: { jump_squat_load: "jump_shrug" } });
    const a = plain.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks));
    const b = p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks));
    const swapped = b.filter((x) => x.swap?.swapped);
    expect(swapped.length).toBeGreaterThan(0);
    for (const x of swapped) {
      expect(x.what.en).toBe("Jump shrugs");
      expect(x.dose).toEqual(a[b.indexOf(x)].dose);
    }
  });
});

describe("the pulls card (lota 6)", () => {
  it("sits in the acceleration and jump libraries, never in a plan by default", () => {
    expect(ACCEL_METHODS).toContain(PULLING_DERIVATIVES);
    expect(JUMP_METHODS).toContain(PULLING_DERIVATIVES);
    for (const { plan } of PLANS) for (const b of blocks(plan)) expect(b.method).not.toBe("pulling_derivatives");
  });

  it("shows both trials side by side and never says pulls beat jumps", () => {
    const refs = PULLING_DERIVATIVES.findings.map((f) => f.ref);
    expect(refs).toEqual(expect.arrayContaining(["berton2022", "suchomel2022"]));
    for (const r of refs) {
      expect(ACCEL_REFS[r], r).toBeDefined();
      expect(JUMP_REFS[r], r).toBeDefined();
    }
    const all = [PULLING_DERIVATIVES.summary, PULLING_DERIVATIVES.dose, PULLING_DERIVATIVES.caution!, ...PULLING_DERIVATIVES.findings.map((f) => f.text), ...(PULLING_DERIVATIVES.howTo ?? [])].map((b) => b.en).join(" ");
    expect(all).not.toMatch(/(better|beat|more effective) than (jumps|plyometrics|bounds)/i);
    expect(PULLING_DERIVATIVES.caution!.en).toMatch(/Not a replacement for jumps/);
    expect(PULLING_DERIVATIVES.caution!.en).toMatch(/under-18s/);
  });
});

describe("bar speed on the cards (lota 6)", () => {
  const cards = [
    ...ACCEL_METHODS.filter((m) => m.key === "heavy_strength" || m.key === "jump_squat"),
    ...JUMP_METHODS.filter((m) => m.key === "heavy_strength" || m.key === "squat_bar_speed"),
  ];
  it("each gym card says what to do with a bar-speed device and cites a bar-speed study", () => {
    expect(cards).toHaveLength(4);
    for (const m of cards) {
      expect((m.howTo ?? []).some((h) => /bar-speed device|with a device/i.test(h.en)), m.key).toBe(true);
      expect(m.findings.some((f) => ["hernandezbelmonte2022", "parejablanco2017", "randell2011"].includes(f.ref)), m.key).toBe(true);
    }
    for (const k of ["heavy_strength", "jump_squat"] as const) {
      expect(SPEED_METHOD_BY_KEY[k].howTo.some((h) => /bar-speed device/.test(h.en)), k).toBe(true);
    }
  });

  it("the speed-loss cards say the studies were on men and mostly on a Smith machine", () => {
    for (const m of cards.filter((c) => c.key !== "jump_squat")) expect(m.caution?.en, m.key).toMatch(/men.*Smith machine/);
  });

  it("no target bar speed is invented for jump squats", () => {
    const js = [ACCEL_METHODS.find((m) => m.key === "jump_squat")!, SPEED_METHOD_BY_KEY.jump_squat];
    for (const m of js) for (const h of m.howTo ?? []) expect(h.en).not.toMatch(/\d(\.\d)? ?m\/s/);
  });

  it("the new references are read in full", () => {
    for (const k of ["hernandezbelmonte2022", "randell2011"] as const) expect(SPEED_REFS[k].verifiedFrom).toBe("full_text");
    for (const k of ["jukic2022", "berton2022", "suchomel2022", "suchomel2017"]) expect(ACCEL_REFS[k].verifiedFrom).toBe("full_text");
    for (const k of ["parejablanco2017", "gonzalezbadillo2015"]) expect(JUMP_REFS[k].verifiedFrom).toBe("full_text");
  });
});

import { describe, expect, it } from "vitest";
import { allowedLevels, allowedStarts, buildGoalPlan, resolveLevel } from "../index";
import { MAX_SESSION_MINUTES } from "../common";
import { SLED_M_RANGE, YOUTH_MAX_CONTACTS } from "../qualityPlans";
import { LEVEL_BASIS, TRAINING_LEVELS, type TrainingLevel } from "../levels";
import { SWAP_NOTE, SWAP_SLOTS, type SwapChoices } from "../swaps";
import { topSpeedWeeks } from "../topSpeed";
import { parseDecision } from "../requests";
import { MAX_FLYING_M_PER_SESSION } from "@/lib/micropulse/speedMethods";
import type { GoalBlock, GoalPlan, GoalPlanInput } from "../types";
import { GOAL_QUALITIES } from "../types";

/**
 * Lota 5: a player's goal plan takes the level the coach picks at approval (default: the team's level from the
 * Programme Library) and the team's saved exercise swaps. Intermediate with no swaps must be today's plan exactly.
 */

const base = (over: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
  quality: "top_speed",
  todayIso: "2026-11-13",
  sport: "football",
  isGoalkeeper: false,
  isActive: true,
  ageYears: 24,
  unavailable: false,
  inSeason: true,
  topSpeed: null,
  sprintTimes: null,
  cmj: null,
  strength: null,
  braking: null,
  weakerLeg: null,
  ...over,
});

const ts = (daysSince: number | null) => ({ level: "ok" as const, daysSince, refKmh: 32, targetKmh: 28.8, confidence: "high" as const });
const strong = { imtpRelNkg: 45, imtpBand: "good" as const, dsiTier: null, dsiBasis: null, date: "2026-10-01" };
const weak = { imtpRelNkg: 30, imtpBand: "below" as const, dsiTier: null, dsiBasis: null, date: "2026-10-01" };
const shapes: Partial<GoalPlanInput>[] = [
  {},
  { topSpeed: ts(4), strength: strong },
  { topSpeed: ts(30), strength: weak },
  { strength: { ...strong, imtpBand: null, imtpRelNkg: null, dsiTier: "ballistic", dsiBasis: "squad" } },
  { cmj: { heightCm: 38, rsiMod: 0.4, date: "2026-10-01", heightBand: "average", rsiBand: "below" }, strength: strong },
  { braking: { overloadFlag: "red", codAsymHighPct: 22, codLean: "left" } },
  { braking: { overloadFlag: "green", codAsymHighPct: 5, codLean: "balanced" }, weakerLeg: { side: "right", asymPct: 14, test: "Single-Leg Jump", date: "2026-10-01" } },
];

const ok = (p: GoalPlan) => p.status === "ok";
const numbers = (t: string) => t.match(/\d+(?:[.,]\d+)?/g) ?? [];
const blocksOf = (p: GoalPlan): GoalBlock[] => p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks));
/** The plan without the lota-5 bookkeeping, to compare with an older build. */
const core = (p: GoalPlan) => ({ weeks: p.weeks, facts: p.facts, limits: p.limits, safety: p.safety, verdict: p.verdict, start: p.start });

/** Every quality × shape × age × season × allowed start × allowed level. */
function everyLevelPlan(): { p: GoalPlan; level: TrainingLevel }[] {
  const out: { p: GoalPlan; level: TrainingLevel }[] = [];
  for (const q of GOAL_QUALITIES) for (const sh of shapes) for (const age of [24, 16, null]) for (const inSeason of [true, false]) {
    const input = base({ ...sh, quality: q, ageYears: age, inSeason });
    for (const st of allowedStarts(input)) {
      const withStart = { ...input, startOverride: st.key };
      for (const level of TRAINING_LEVELS) {
        const p = buildGoalPlan({ ...withStart, level });
        if (ok(p)) out.push({ p, level });
      }
    }
  }
  return out;
}

describe("levels in goal plans (lota 5)", () => {
  it("intermediate, or no level at all, is the plan as it was", () => {
    for (const q of GOAL_QUALITIES) for (const sh of shapes) for (const inSeason of [true, false]) {
      const input = base({ ...sh, quality: q, inSeason });
      const before = buildGoalPlan(input);
      expect(core(buildGoalPlan({ ...input, level: "intermediate", swaps: {} }))).toEqual(core(before));
      expect(core(buildGoalPlan({ ...input, level: null, swaps: null }))).toEqual(core(before));
      if (ok(before)) expect(before.level).toBe("intermediate");
    }
  });

  it("youth (under 18 or age unknown) never gets a level: the youth plan is used whatever is asked", () => {
    for (const q of GOAL_QUALITIES) for (const age of [16, null]) {
      const input = base({ quality: q, ageYears: age });
      expect(allowedLevels(input)).toEqual([]);
      const plain = buildGoalPlan(input);
      for (const level of TRAINING_LEVELS) {
        const p = buildGoalPlan({ ...input, level });
        expect(p.youthLevel).toBe(true);
        expect(p.weeks).toEqual(plain.weeks);
        expect(p.limits.map((l) => l.en)).not.toContain(LEVEL_BASIS.en);
      }
    }
  });

  it("jump with the fast-jumps start offers no beginner level; an asked beginner falls back to intermediate", () => {
    const input = base({ quality: "jump", cmj: { heightCm: 38, rsiMod: 0.4, date: "2026-10-01", heightBand: "average", rsiBand: "below" }, strength: strong, startOverride: "fast_jumps" });
    expect(allowedLevels(input)).not.toContain("beginner");
    expect(resolveLevel({ ...input, level: "beginner" })).toBe("intermediate");
    expect(buildGoalPlan({ ...input, level: "beginner" }).level).toBe("intermediate");
  });

  it("beginner and advanced change the plan, and say that the studies tested the middle level", () => {
    for (const q of GOAL_QUALITIES) {
      const input = base({ quality: q, topSpeed: ts(4), strength: strong });
      const mid = buildGoalPlan(input);
      for (const level of ["beginner", "advanced"] as const) {
        if (!allowedLevels(input).includes(level)) continue;
        const p = buildGoalPlan({ ...input, level });
        expect(p.level, `${q} ${level}`).toBe(level);
        expect(p.weeks, `${q} ${level}`).not.toEqual(mid.weeks);
        expect(p.limits[0].en).toBe(LEVEL_BASIS.en);
      }
    }
  });

  it("every level, start and player shape keeps the safety limits", () => {
    const all = everyLevelPlan();
    expect(all.length).toBeGreaterThan(100);
    for (const { p, level } of all) for (const w of p.weeks) for (const s of w.sessions) {
      const tag = `${p.quality} ${p.start} ${level} · ${w.label.en} ${s.slot}`;
      expect(s.minutes, tag).toBeLessThanOrEqual(MAX_SESSION_MINUTES);
      expect(s.blocks.reduce((m, b) => m + (b.flatOutM ?? 0), 0), tag).toBeLessThanOrEqual(MAX_FLYING_M_PER_SESSION);
      if (p.youthLevel) expect(s.blocks.reduce((t, b) => t + (b.contacts ?? 0), 0), tag).toBeLessThanOrEqual(YOUTH_MAX_CONTACTS);
      for (const b of s.blocks) {
        if (p.youthLevel) {
          expect(b.supervised, tag).toBe(true);
          expect(b.method, tag).not.toBe("resisted_sled");
        }
        if (b.dropJumps || b.hardStops || (b.flatOutM ?? 0) > 0) expect(b.supervised, tag).toBe(true);
        if (b.method === "resisted_sled") {
          expect(level, tag).not.toBe("beginner");
          expect(b.sledM ?? 0, tag).toBeGreaterThanOrEqual(45);
          expect(b.sledM ?? 0, tag).toBeLessThanOrEqual(SLED_M_RANGE.max);
        }
      }
      if (p.sessionsPerWeek === 2) expect(w.sessions.filter((x) => x.blocks.some((b) => b.topSpeed)).length, tag).toBeLessThanOrEqual(1);
    }
  });

  it("top speed: advanced has a longer fast zone than beginner, both within 150 m flat out", () => {
    const zone = (lv: TrainingLevel) => Math.max(...topSpeedWeeks("ready", "balanced", lv).flatMap((w) => w.sessions.flatMap((s) => s.blocks.map((b) => b.flatOutM ?? 0))));
    expect(zone("advanced")).toBeGreaterThan(zone("intermediate"));
    expect(zone("intermediate")).toBeGreaterThanOrEqual(zone("beginner"));
    for (const lv of TRAINING_LEVELS) for (const start of ["build_first", "ready"] as const) for (const e of ["strength", "power", "balanced"] as const) {
      for (const w of topSpeedWeeks(start, e, lv)) for (const s of w.sessions) {
        expect(s.blocks.reduce((t, b) => t + (b.flatOutM ?? 0), 0), `${lv} ${start} ${e} ${w.label.en}`).toBeLessThanOrEqual(MAX_FLYING_M_PER_SESSION);
      }
    }
  });
});

describe("team swaps in goal plans (lota 5)", () => {
  it("only the swapped blocks change and get a mark; every count stays the same", () => {
    let swappedSomewhere = 0;
    for (const q of GOAL_QUALITIES) for (const sh of shapes) {
      const input = base({ ...sh, quality: q, inSeason: false });
      const plain = buildGoalPlan(input);
      if (!ok(plain)) continue;
      for (const slot of SWAP_SLOTS.filter((s) => s.qualities.includes(q))) for (const opt of slot.options.slice(1)) {
        const p = buildGoalPlan({ ...input, swaps: { [slot.key]: opt.key } as SwapChoices });
        const a = blocksOf(plain);
        const b = blocksOf(p);
        expect(b.length).toBe(a.length);
        let changed = 0;
        b.forEach((blk, i) => {
          // The exercise name may change in the dose text too; the numbers never do.
          const { swap, what, dose, ...rest } = blk;
          const { what: whatBefore, swap: _none, dose: doseBefore, ...restBefore } = a[i];
          expect(_none).toBeUndefined();
          expect(rest).toEqual(restBefore);
          expect(numbers(dose.en)).toEqual(numbers(doseBefore.en));
          expect(numbers(dose.is)).toEqual(numbers(doseBefore.is));
          if (swap) {
            expect(swap.swapped).toBe(true);
            expect(swap.slot).toBe(slot.key);
            // "planned" names the exercise the plan had (shown as "planned: X").
            expect(swap.planned.en.length).toBeGreaterThan(0);
            expect(swap.planned.is.length).toBeGreaterThan(0);
            expect(swap.option).toBe(opt.key);
            expect({ what, dose }).not.toEqual({ what: whatBefore, dose: doseBefore });
            changed++;
          } else {
            expect(what).toEqual(whatBefore);
          }
        });
        if (changed) {
          swappedSomewhere++;
          expect(p.swaps).toEqual({ [slot.key]: opt.key });
          expect(p.limits.map((l) => l.en)).toContain(SWAP_NOTE.en);
        } else {
          expect(p.swaps).toEqual({});
          expect(core(p)).toEqual(core(plain));
        }
      }
    }
    expect(swappedSomewhere).toBeGreaterThan(5);
  });

  it("unknown swaps are ignored, never half-applied", () => {
    const input = base({ quality: "acceleration", strength: weak, inSeason: false });
    const plain = buildGoalPlan(input);
    const bad = buildGoalPlan({ ...input, swaps: { heavy_legs: "deadlift_from_the_moon" } as unknown as SwapChoices });
    expect(core(bad)).toEqual(core(plain));
    expect(bad.swaps).toEqual({});
  });
});

describe("approval carries the level (lota 5)", () => {
  const TODAY = "2026-11-13";
  const approve = (over: Record<string, unknown> = {}) => parseDecision({ action: "approve", startDate: "2026-11-16", ...over }, TODAY, "build_first");
  it("no level = the team's level (null); a known level passes; anything else is refused", () => {
    const none = approve();
    expect(none.ok).toBe(true);
    if (none.ok && none.value.action === "approve") expect(none.value.level).toBeNull();
    const adv = approve({ level: "advanced" });
    expect(adv.ok).toBe(true);
    if (adv.ok && adv.value.action === "approve") expect(adv.value.level).toBe("advanced");
    expect(approve({ level: "expert" }).ok).toBe(false);
    expect(approve({ level: 3 }).ok).toBe(false);
  });
});

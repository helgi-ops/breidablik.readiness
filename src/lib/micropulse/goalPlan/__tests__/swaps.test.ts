import { describe, expect, it } from "vitest";
import { allQualityPlans } from "../qualityPlans";
import { allSpeedPlans } from "../../speedMethods";
import type { Bi, GoalQuality } from "../types";
import {
  PLANNED,
  SWAP_NOTE,
  SWAP_SLOTS,
  SWAPPED_BY_COACH,
  applySwaps,
  hasSwaps,
  slotsFor,
  swapMark,
  validateSwaps,
  type SwapChoices,
} from "../swaps";

type AnyBlock = { method: string; what: Bi; dose: Bi; test?: boolean } & Record<string, unknown>;
type AnyPlan = { weeks: { sessions: { blocks: AnyBlock[] }[] }[] };

const PLANS: { quality: GoalQuality; plan: AnyPlan }[] = [
  ...allQualityPlans().map((p) => ({ quality: p.quality as GoalQuality, plan: p as unknown as AnyPlan })),
  ...allSpeedPlans().map((p) => ({ quality: "top_speed" as GoalQuality, plan: p as unknown as AnyPlan })),
];

const blocks = (p: AnyPlan) => p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks));
const counters = (b: AnyBlock) => {
  const { what: _w, dose: _d, swap: _s, ...rest } = b;
  return rest;
};

describe("exercise swaps (lota 4, step 3)", () => {
  it("every slot lists the planned exercise first, then at least one alternative, with unique keys", () => {
    for (const s of SWAP_SLOTS) {
      expect(s.options[0].key).toBe(PLANNED);
      expect(s.options[0].edits.en).toHaveLength(0);
      expect(s.options.length).toBeGreaterThanOrEqual(2);
      expect(new Set(s.options.map((o) => o.key)).size).toBe(s.options.length);
    }
  });

  it("every slot is used in at least one plan of each quality it lists", () => {
    for (const s of SWAP_SLOTS) {
      for (const q of s.qualities) {
        const used = PLANS.some(({ quality, plan }) => quality === q && blocks(applySwaps(plan, q, {})).some((b) => swapMark(b)?.slot === s.key));
        expect(used, `${s.key} in ${q}`).toBe(true);
      }
    }
  });

  it("no swaps: the text is exactly the plan, swappable blocks only get a mark", () => {
    for (const { quality, plan } of PLANS) {
      const shown = applySwaps(plan, quality, {});
      expect(hasSwaps(shown)).toBe(false);
      const a = blocks(plan);
      const b = blocks(shown);
      a.forEach((orig, i) => {
        expect(b[i].what).toEqual(orig.what);
        expect(b[i].dose).toEqual(orig.dose);
        expect(counters(b[i])).toEqual(counters(orig));
      });
    }
  });

  it("a swap changes the exercise in both languages and never the method, dose numbers or counters", () => {
    for (const { quality, plan } of PLANS) {
      for (const slot of slotsFor(quality)) {
        for (const opt of slot.options.slice(1)) {
          const shown = applySwaps(plan, quality, { [slot.key]: opt.key } as SwapChoices);
          const a = blocks(plan);
          const b = blocks(shown);
          expect(b).toHaveLength(a.length);
          a.forEach((orig, i) => {
            const mark = swapMark(b[i]);
            expect(counters(b[i])).toEqual(counters(orig));
            if (mark?.slot === slot.key) {
              expect(mark.swapped).toBe(true);
              expect(mark.planned).toEqual(slot.options[0].label);
              expect(`${b[i].what.en}|${b[i].dose.en}`, `${slot.key}/${opt.key} EN: ${orig.what.en}`).not.toBe(`${orig.what.en}|${orig.dose.en}`);
              expect(`${b[i].what.is}|${b[i].dose.is}`, `${slot.key}/${opt.key} IS: ${orig.what.is}`).not.toBe(`${orig.what.is}|${orig.dose.is}`);
              // The numbers in the dose line stay the same.
              const nums = (t: string) => t.match(/\d+(?:[.,]\d+)?/g) ?? [];
              expect(nums(b[i].dose.en)).toEqual(nums(orig.dose.en));
              expect(nums(b[i].dose.is)).toEqual(nums(orig.dose.is));
            } else {
              expect(b[i].what).toEqual(orig.what);
              expect(b[i].dose).toEqual(orig.dose);
            }
          });
          // The plan given in is never changed.
          expect(blocks(plan).some((x) => swapMark(x))).toBe(false);
        }
      }
    }
  });

  it("tests, tested braking drills, flying sprints, Nordic, squat by bar speed, drop jumps and youth hops are never swappable", () => {
    const never = new Set(["decel_technique", "flying_sprints", "nordic", "drop_jumps", "youth_hops", "landing_drills"]);
    for (const { quality, plan } of PLANS) {
      for (const b of blocks(applySwaps(plan, quality, {}))) {
        if (b.test || never.has(b.method) || b.what.en === "Full squat, moved fast") expect(swapMark(b), `${quality}: ${b.what.en}`).toBeUndefined();
      }
    }
  });

  it("the sled swap is only offered where a sled is planned (never in youth plans)", () => {
    for (const { quality, plan } of PLANS) {
      const marks = blocks(applySwaps(plan, quality, {})).filter((b) => swapMark(b)?.slot === "sled");
      for (const b of marks) expect(b.method).toBe("resisted_sled");
    }
  });

  it("validateSwaps keeps known swaps, drops 'planned' and rejects anything unknown", () => {
    expect(validateSwaps("acceleration", { heavy_legs: "trap_bar", sled: PLANNED })).toEqual({ heavy_legs: "trap_bar" });
    expect(validateSwaps("acceleration", undefined)).toEqual({});
    expect(validateSwaps("acceleration", { heavy_legs: "barbell_curl" })).toBeNull();
    expect(validateSwaps("acceleration", { nope: "x" })).toBeNull();
    expect(validateSwaps("braking", { heavy_legs: "trap_bar" })).toBeNull(); // not a braking slot
    expect(validateSwaps("jump", ["x"])).toBeNull();
    expect(validateSwaps("jump", "x")).toBeNull();
    expect(validateSwaps("jump", { rebound_jumps: 3 })).toBeNull();
  });

  it("wording: both languages filled, no placeholders, swaps said to be untested", () => {
    const texts: Bi[] = [SWAP_NOTE, SWAPPED_BY_COACH];
    for (const s of SWAP_SLOTS) texts.push(s.label, ...s.options.map((o) => o.label));
    for (const t of texts) {
      expect(t.en.trim().length).toBeGreaterThan(0);
      expect(t.is.trim().length).toBeGreaterThan(0);
      expect(t.is).not.toMatch(/\((ur|n|a|i)\)/);
    }
    expect(SWAP_NOTE.en).toMatch(/not tested/);
    expect(SWAP_NOTE.is).toMatch(/ekki prófaðar/);
  });
});

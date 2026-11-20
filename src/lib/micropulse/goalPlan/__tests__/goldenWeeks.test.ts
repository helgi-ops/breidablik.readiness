import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { accelWeeks } from "../acceleration";
import { brakingWeeks } from "../braking";
import { jumpWeeks } from "../jump";
import { topSpeedWeeks } from "../topSpeed";
import { allQualityPlans } from "../qualityPlans";
import { SPEED_PLANS } from "@/lib/micropulse/speedMethods";

/**
 * Golden copy of every player goal plan's weeks. The Programme Library may add levels and swaps, but a player's goal
 * plan must not change by accident: if a hash here changes, the change was meant (bump GOAL_CONTENT_VERSION and say
 * so in the commit) or it is a bug.
 *
 * Changed on purpose so far:
 *  - 2026-11-15 jump adult starts: 50–60 foot contacts a session (squat jumps + countermovement jumps added).
 *  - 2026-11-20 when-text only (GOAL_CONTENT_VERSION 2026-11-20.1): the gym session's day ("heavy gym day, MD-4 else
 *    MD-3, inside the team strength session" in pre-/off-season) and braking's session B (MD-3 in pre-season). No
 *    dose, method or source changed.
 *
 * The Programme Library's plans at the intermediate level are pinned too (lota 4 step 2): intermediate IS the plan
 * as it was before levels existed, so adding beginner / advanced must not move a single word of it.
 */
const h = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
const LEFT = { side: "left", asymPct: 12, test: "nordbord", date: null } as const;

const GOLDEN: Record<string, string> = {
  "accel:youth": "4b3bb21c12d76c79",
  "accel:strength_first": "742f3afc862dac8b",
  "accel:starts_first": "58eef02858ee404a",
  "accel:balanced": "89f90936bb372568",
  "braking:standard": "3c8d7c27af8bf581",
  "braking:technique_only": "290532611e00cc94",
  "top:build_first:strength": "57a5be621d94c2c0",
  "top:build_first:power": "8383bb6a088d0d26",
  "top:build_first:balanced": "97bc9bb09f370029",
  "top:ready:strength": "b5e6295b965cdd38",
  "top:ready:power": "1a6db213242796b4",
  "top:ready:balanced": "708f051224b5bda2",
  "jump:youth": "3e6f4e475804694c",
};

function current(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of ["youth", "strength_first", "starts_first", "balanced"] as const) out[`accel:${s}`] = h(accelWeeks(s, s === "youth"));
  for (const s of ["standard", "technique_only"] as const) out[`braking:${s}`] = h(brakingWeeks(s, null));
  for (const s of ["build_first", "ready"] as const) for (const e of ["strength", "power", "balanced"] as const) out[`top:${s}:${e}`] = h(topSpeedWeeks(s, e));
  out["jump:youth"] = h(jumpWeeks("youth"));
  return out;
}

const LIBRARY_GOLDEN: Record<string, string> = {
  "lib:acceleration:in_season": "271080b23d826d96",
  "lib:acceleration:pre_season": "9c03e5fc25129599",
  "lib:acceleration:individual:strength_first": "278628f61ea1c16c",
  "lib:acceleration:individual:starts_first": "7ce2cfbb26cad982",
  "lib:acceleration:individual:balanced": "37db776ba165186b",
  "lib:acceleration:individual:youth": "015566cfd289738d",
  "lib:braking:in_season": "6faad98f63e48d2c",
  "lib:braking:pre_season": "4bec17684ac939c0",
  "lib:braking:individual:standard": "dfddd3ce100c3b04",
  "lib:braking:individual:technique_only": "3939a5aeeda0c10d",
  "lib:jump:in_season": "09ac64e93fe0dd44",
  "lib:jump:pre_season": "d8df0f139944f2fe",
  "lib:jump:individual:combined": "ddd6353dedea8f42",
  "lib:jump:individual:strength_first": "3bc083e1c019a487",
  "lib:jump:individual:fast_jumps": "a84a80e03d4be38e",
  "lib:jump:individual:youth": "2f04bf3e04d8db34",
  "speed:in_season": "0a0e2a1e7d19fd65",
  "speed:pre_season": "e0c6abe1b0748b65",
  "speed:individual": "bf59f2c0ff662996",
  "jump:combined": "8f973b58a1d7e829",
  "jump:strength_first": "ea16a1b972dcc90d",
  "jump:fast_jumps": "b6a1aeee045c021b",
};

function libraryCurrent(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of allQualityPlans(["intermediate"])) out[`lib:${p.quality}:${p.key}${p.start ? `:${p.start}` : ""}`] = h(p);
  for (const p of SPEED_PLANS) out[`speed:${p.key}`] = h(p);
  for (const s of ["combined", "strength_first", "fast_jumps"] as const) out[`jump:${s}`] = h(jumpWeeks(s));
  return out;
}

describe("player goal plans stay as they are (golden copy)", () => {
  it("the Programme Library's intermediate level is the plans as they were, word for word", () => {
    expect(libraryCurrent()).toEqual(LIBRARY_GOLDEN);
  });

  it("acceleration, braking, top speed and youth jump weeks are unchanged", () => {
    expect(current()).toEqual(GOLDEN);
  });

  it("a weaker leg still adds its extra set in braking", () => {
    expect(h(brakingWeeks("standard", LEFT))).not.toBe(GOLDEN["braking:standard"]);
  });
});

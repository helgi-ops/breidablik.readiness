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
 *
 * The Programme Library's plans at the intermediate level are pinned too (lota 4 step 2): intermediate IS the plan
 * as it was before levels existed, so adding beginner / advanced must not move a single word of it.
 */
const h = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
const LEFT = { side: "left", asymPct: 12, test: "nordbord", date: null } as const;

const GOLDEN: Record<string, string> = {
  "accel:youth": "0718167f5e6f8353",
  "accel:strength_first": "740b8e48d7f578a4",
  "accel:starts_first": "22ad2c947c9966ff",
  "accel:balanced": "912ee2c64592ab38",
  "braking:standard": "03324fe70625e078",
  "braking:technique_only": "5dd4fb071ea47b3e",
  "top:build_first:strength": "93b54b94a6f32c3e",
  "top:build_first:power": "9bedb176b7f20025",
  "top:build_first:balanced": "82d9c9fcb29efed6",
  "top:ready:strength": "baa15f789f5f957a",
  "top:ready:power": "3d5003cd00bc2c0d",
  "top:ready:balanced": "3f3ecb84ad735deb",
  "jump:youth": "c17ebaa72a3ad1cd",
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
  "lib:acceleration:individual:strength_first": "7dda6a10af717d2e",
  "lib:acceleration:individual:starts_first": "a6e09c8bff0fc665",
  "lib:acceleration:individual:balanced": "dddb51f68c742a3d",
  "lib:acceleration:individual:youth": "d9bd0e818b4c7a03",
  "lib:braking:in_season": "6faad98f63e48d2c",
  "lib:braking:pre_season": "4bec17684ac939c0",
  "lib:braking:individual:standard": "7eba57c53b958c78",
  "lib:braking:individual:technique_only": "2bf72d4291c41ec2",
  "lib:jump:in_season": "09ac64e93fe0dd44",
  "lib:jump:pre_season": "d8df0f139944f2fe",
  "lib:jump:individual:combined": "00e5b0381d96d388",
  "lib:jump:individual:strength_first": "073005c0dee72faa",
  "lib:jump:individual:fast_jumps": "a7b3e4371c7e779a",
  "lib:jump:individual:youth": "0e0b439d3483ecbb",
  "speed:in_season": "0a0e2a1e7d19fd65",
  "speed:pre_season": "e0c6abe1b0748b65",
  "speed:individual": "bf59f2c0ff662996",
  "jump:combined": "904d4d520dd37e22",
  "jump:strength_first": "f6472792f08ffdcb",
  "jump:fast_jumps": "fbd2bc878fc7d7dc",
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

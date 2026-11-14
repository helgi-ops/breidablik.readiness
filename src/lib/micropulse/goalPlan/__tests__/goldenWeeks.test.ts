import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { accelWeeks } from "../acceleration";
import { brakingWeeks } from "../braking";
import { jumpWeeks } from "../jump";
import { topSpeedWeeks } from "../topSpeed";

/**
 * Golden copy of every player goal plan's weeks. The Programme Library may add levels and swaps, but a player's goal
 * plan must not change by accident: if a hash here changes, the change was meant (bump GOAL_CONTENT_VERSION and say
 * so in the commit) or it is a bug.
 *
 * Changed on purpose so far:
 *  - 2026-11-15 jump adult starts: 50–60 foot contacts a session (squat jumps + countermovement jumps added).
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

describe("player goal plans stay as they are (golden copy)", () => {
  it("acceleration, braking, top speed and youth jump weeks are unchanged", () => {
    expect(current()).toEqual(GOLDEN);
  });

  it("a weaker leg still adds its extra set in braking", () => {
    expect(h(brakingWeeks("standard", LEFT))).not.toBe(GOLDEN["braking:standard"]);
  });
});

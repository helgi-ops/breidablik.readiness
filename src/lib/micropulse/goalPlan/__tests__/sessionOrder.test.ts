import { describe, expect, it } from "vitest";
import { allQualityPlans, INDIVIDUAL_STARTS, individualWeeks } from "../qualityPlans";
import { LIBRARY_QUALITIES } from "../qualityLibrary";
import { topSpeedWeeks } from "../topSpeed";
import { allSpeedPlans } from "@/lib/micropulse/speedMethods";
import { TRAINING_LEVELS } from "../levels";

/**
 * Coach's rule: in a session with both power and strength work, the power (sprints, jumps, bounds, jump squats)
 * always comes first and the strength lifts after. Contrast pairs and strength-plus-sprint pairs are their own
 * method (heavy-then-fast by definition) and are not checked here.
 */
const STRENGTH = new Set(["heavy_strength", "eccentric_strength", "hip_thrust", "nordic"]);
const POWER = new Set(["accel_sprints", "resisted_sled", "bounds", "jump_squat", "rebound_jumps", "drop_jumps", "squat_cmj_jumps", "youth_hops", "plyometrics", "flying_sprints", "decel_technique", "landing_drills"]);

type Block = { method: string; what: { en: string }; test?: boolean };
function powerAfterStrength(blocks: Block[]): string | null {
  const firstStrength = blocks.findIndex((b) => STRENGTH.has(b.method));
  if (firstStrength < 0) return null;
  const late = blocks.slice(firstStrength + 1).find((b) => POWER.has(b.method) && !b.test);
  return late ? `${blocks[firstStrength].what.en} before ${late.what.en}` : null;
}

describe("power before strength in every session", () => {
  it("acceleration, braking and jump plans (team + individual)", () => {
    for (const p of allQualityPlans()) for (const w of p.weeks) for (const s of w.sessions) {
      expect(powerAfterStrength(s.blocks), `${p.title.en} · ${w.label.en}`).toBeNull();
    }
    for (const lv of TRAINING_LEVELS) for (const q of LIBRARY_QUALITIES) for (const st of INDIVIDUAL_STARTS[q]) for (const w of individualWeeks(q, st.key, lv)) for (const s of w.sessions) {
      expect(powerAfterStrength(s.blocks), `${lv} ${q} ${st.key} · ${w.label.en}`).toBeNull();
    }
  });

  it("top-speed goal plan, every start, gym emphasis and level", () => {
    for (const lv of TRAINING_LEVELS) for (const start of ["build_first", "ready"] as const) for (const e of ["strength", "power", "balanced"] as const) {
      for (const w of topSpeedWeeks(start, e, lv)) for (const s of w.sessions) {
        expect(powerAfterStrength(s.blocks), `${lv} ${start}/${e} · ${w.label.en}`).toBeNull();
      }
    }
  });

  it("top-speed library plans", () => {
    for (const p of allSpeedPlans()) for (const w of p.weeks) for (const s of w.sessions) {
      expect(powerAfterStrength(s.blocks), `${p.title.en} · ${w.label.en}`).toBeNull();
    }
  });
});

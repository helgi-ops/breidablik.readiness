import { describe, it, expect } from "vitest";
import { suggestLowerLoadSwap } from "../drillSwap";
import { drillKpiLoad } from "../drillLoad";

const d = (id: string, category: string, over: Record<string, unknown>): Record<string, unknown> => ({
  id, drill_name: id, category,
  distance_m: 0, player_load: 0, vel_b5: 0, vel_b6: 0, accel_b23: 0, decel_b23: 0, ...over,
});

describe("drillKpiLoad", () => {
  it("maps a single drill row to its LoadKpi load", () => {
    expect(drillKpiLoad({ vel_b5: 300, decel_b23: 12 })).toEqual({ hsr: 300, decel: 12 });
  });
});

describe("suggestLowerLoadSwap", () => {
  const current = d("hi_ssg", "ssg", { vel_b5: 400, vel_b6: 80, decel_b23: 20 });

  it("offers a same-category, lower-HSR drill for a HSR (MAX_SPEED) conflict", () => {
    const candidates = [
      d("low_ssg", "ssg", { vel_b5: 200, vel_b6: 40 }),   // −50% HSR, −50% sprint → qualifies
      d("hi2_ssg", "ssg", { vel_b5: 420, vel_b6: 90 }),   // higher → disqualified
      d("low_poss", "possession", { vel_b5: 100 }),        // different category → excluded
      current,                                             // itself → skipped
    ];
    const out = suggestLowerLoadSwap(current, candidates, ["hsr", "sprint"]);
    expect(out.map((s) => s.id)).toEqual(["low_ssg"]);
    expect(out[0].maxReductionPct).toBeLessThanOrEqual(-15);
  });

  it("driving-KPI focus: a drill lower on HSR but HIGHER on the driving decel is NOT offered for a decel conflict", () => {
    const lowerHsrHigherDecel = d("mix_ssg", "ssg", { vel_b5: 100, decel_b23: 30 });
    const out = suggestLowerLoadSwap(current, [lowerHsrHigherDecel], ["decel"]);
    expect(out).toEqual([]); // higher on the driving KPI → disqualified
  });

  it("respects the ≥15% reduction threshold (a 10% lower drill is not offered)", () => {
    const barely = d("barely", "ssg", { vel_b5: 360, vel_b6: 74 }); // −10% → below threshold
    expect(suggestLowerLoadSwap(current, [barely], ["hsr", "sprint"])).toEqual([]);
  });

  it("ranks lightest driving-KPI load first and caps at the limit", () => {
    const candidates = [
      d("a", "ssg", { vel_b5: 300, vel_b6: 60 }), // −25%
      d("b", "ssg", { vel_b5: 150, vel_b6: 30 }), // −62% (lightest)
      d("c", "ssg", { vel_b5: 250, vel_b6: 50 }), // −37%
    ];
    const out = suggestLowerLoadSwap(current, candidates, ["hsr", "sprint"], { limit: 2 });
    expect(out.map((s) => s.id)).toEqual(["b", "c"]); // lightest first, capped at 2
  });

  it("returns nothing when the current drill doesn't load the driving KPI", () => {
    const noHsr = d("tech", "warmup", { player_load: 100 });
    expect(suggestLowerLoadSwap(noHsr, [d("x", "warmup", { player_load: 50 })], ["hsr"])).toEqual([]);
  });
});

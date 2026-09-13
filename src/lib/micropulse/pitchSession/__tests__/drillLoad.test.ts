import { describe, it, expect } from "vitest";
import { sumSessionDrillLoad, comparePlannedToTarget, DRILL_COLUMN_TO_KPI } from "../drillLoad";
import type { KpiTarget } from "@/lib/micropulse/loadPlan";

/**
 * The bridge that lets the pitch-session builder speak the load-target's KPI
 * vocabulary: sum drills → LoadKpi totals, then compare vs the MD target using
 * the SAME 85–115% adherence bands as plan-vs-actual.
 */

const drill = (over: Record<string, unknown>): Record<string, unknown> => ({
  distance_m: 0, player_load: 0, vel_b5: 0, vel_b6: 0, accel_b23: 0, decel_b23: 0,
  ima_cod_total: 0, high_ima: 0, jump_count: 0, ...over,
});

describe("sumSessionDrillLoad", () => {
  it("maps every drill_library column to its LoadKpi (sets=1)", () => {
    const d = drill({ distance_m: 1200, player_load: 320, vel_b5: 400, vel_b6: 90, accel_b23: 22, decel_b23: 18, ima_cod_total: 30, high_ima: 250, jump_count: 12 });
    const out = sumSessionDrillLoad([{ drill: d, sets: 1 }]);
    expect(out).toEqual({ totalDistance: 1200, playerLoad: 320, hsr: 400, sprint: 90, accel: 22, decel: 18, imaCod: 30, ima: 250, jumps: 12 });
  });

  it("multiplies by sets and accumulates across drills", () => {
    const a = drill({ distance_m: 500, vel_b5: 100 });
    const b = drill({ distance_m: 300, vel_b5: 50, decel_b23: 10 });
    const out = sumSessionDrillLoad([{ drill: a, sets: 2 }, { drill: b, sets: 3 }]);
    expect(out.totalDistance).toBe(500 * 2 + 300 * 3); // 1900
    expect(out.hsr).toBe(100 * 2 + 50 * 3);            // 350
    expect(out.decel).toBe(10 * 3);                    // 30
  });

  it("parses numeric strings and treats sets<=0 as 1", () => {
    const out = sumSessionDrillLoad([{ drill: drill({ distance_m: "600" }), sets: 0 }]);
    expect(out.totalDistance).toBe(600);
  });

  it("includes only columns present on the drill (absent → skipped, real 0 kept)", () => {
    // Bare row: only player_load present; other columns undefined → not summed.
    const sparse = sumSessionDrillLoad([{ drill: { player_load: 200 }, sets: 1 }]);
    expect(Object.keys(sparse)).toEqual(["playerLoad"]);
    // A real 0 IS a value (a passing drill genuinely has 0 sprint) → kept.
    const withZero = sumSessionDrillLoad([{ drill: { player_load: 200, vel_b6: 0 }, sets: 1 }]);
    expect(withZero.sprint).toBe(0);
  });

  it("empty session → no KPIs", () => {
    expect(sumSessionDrillLoad([])).toEqual({});
  });

  it("maps hir_total to nothing (avoids double-counting hsr)", () => {
    expect("hir_total" in DRILL_COLUMN_TO_KPI).toBe(false);
  });
});

describe("comparePlannedToTarget", () => {
  const tgt = (kpi: KpiTarget["kpi"], target: number | null): KpiTarget => ({ kpi, target, matchRef: null, pctOfMatch: null });

  it("computes pct = planned/target and the shared adherence band", () => {
    const targets = [tgt("hsr", 1000), tgt("playerLoad", 400)];
    const out = comparePlannedToTarget({ hsr: 880, playerLoad: 500 }, targets);
    const hsr = out.find((r) => r.kpi === "hsr")!;
    expect(hsr.pctOfTarget).toBe(88);
    expect(hsr.band).toBe("on");
    const pl = out.find((r) => r.kpi === "playerLoad")!;
    expect(pl.pctOfTarget).toBe(125);
    expect(pl.band).toBe("over");
  });

  it("band edges: 84→under, 85→on, 115→on, 116→over", () => {
    const t = [tgt("hsr", 1000)];
    expect(comparePlannedToTarget({ hsr: 840 }, t)[0].band).toBe("under");
    expect(comparePlannedToTarget({ hsr: 850 }, t)[0].band).toBe("on");
    expect(comparePlannedToTarget({ hsr: 1150 }, t)[0].band).toBe("on");
    expect(comparePlannedToTarget({ hsr: 1160 }, t)[0].band).toBe("over");
  });

  it("skips KPIs the session doesn't load; na band when target is null/zero", () => {
    const targets = [tgt("hsr", 1000), tgt("sprint", 200)];
    const out = comparePlannedToTarget({ sprint: 150 }, targets); // no hsr planned
    expect(out.map((r) => r.kpi)).toEqual(["sprint"]);

    const na = comparePlannedToTarget({ hsr: 500 }, [tgt("hsr", null)]);
    expect(na[0].band).toBe("na");
    expect(na[0].planned).toBe(500);
  });
});

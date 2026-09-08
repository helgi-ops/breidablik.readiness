import { describe, it, expect } from "vitest";
import { imaDeficitsFromTotals, type ImaTotals } from "../imaSignals";
import { reconcile } from "../reconcile";

const T = (p: Partial<ImaTotals>): ImaTotals => ({ accel: 0, decel: 0, codLeft: 0, codRight: 0, days: 10, latest: "2026-09-01", ...p });

describe("IMA writer — mechanical & directional deficits", () => {
  it("low deceleration share flags decel_mechanics (measured, contextual)", () => {
    const rows = imaDeficitsFromTotals(T({ accel: 80, decel: 25 })); // 25/105 = 24% → severe
    const d = rows.find((r) => r.quality === "decel_mechanics")!;
    expect(d).toBeTruthy();
    expect(d.source).toBe("ima");
    expect(d.status).toBe("confirmed");
    expect(d.severity).toBe("severe");
  });

  it("balanced accel/decel does NOT flag a decel deficit", () => {
    const rows = imaDeficitsFromTotals(T({ accel: 60, decel: 60 })); // 50% share
    expect(rows.some((r) => r.quality === "decel_mechanics")).toBe(false);
  });

  it("CoD left/right imbalance flags a directional limb asymmetry, lower side tagged", () => {
    const rows = imaDeficitsFromTotals(T({ codLeft: 40, codRight: 20 })); // 50% asym, R lower
    const d = rows.find((r) => r.quality === "limb_asymmetry")!;
    expect(d).toBeTruthy();
    expect(d.side).toBe("R");
    expect(d.severity).toBe("severe");
  });

  it("too little IMA volume → no deficit (honest)", () => {
    expect(imaDeficitsFromTotals(T({ accel: 10, decel: 3, codLeft: 5, codRight: 4 }))).toEqual([]);
  });

  it("decel_mechanics feeds BOTH the corrective and strength plans", () => {
    const [d] = reconcile(imaDeficitsFromTotals(T({ accel: 90, decel: 20 })));
    expect(d.quality).toBe("decel_mechanics");
    expect(d.feeds.sort()).toEqual(["corrective", "strength"]);
    expect(d.compensations).toContain("poor_absorption"); // traceable to correctives
  });

  it("IMA corroborates a screen finding: valgus (screen) + CoD asymmetry (IMA) both raise limb_asymmetry-style targets", () => {
    // IMA asymmetry + a VALD asymmetry aggregate to one confirmed limb_asymmetry
    const ima = imaDeficitsFromTotals(T({ codLeft: 40, codRight: 22 }));
    const out = reconcile([
      ...ima,
      { quality: "limb_asymmetry", source: "vald", status: "confirmed", confidence: 0.9, provenance: { en: "VALD", is: "VALD" } },
    ]);
    const d = out.find((x) => x.quality === "limb_asymmetry")!;
    expect(d.sources.map((s) => s.source).sort()).toEqual(["ima", "vald"]);
    expect(d.confidence).toBeGreaterThan(0.9); // agreement bonus
  });
});

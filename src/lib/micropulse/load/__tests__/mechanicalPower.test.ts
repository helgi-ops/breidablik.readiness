import { describe, it, expect } from "vitest";
import {
  computeMechanicalPower,
  mechIntensityFor,
  MIN_MATURE_MECH_SESSIONS,
  MECH_DEMAND_BAND,
  type MechRow,
} from "../mechanicalPower";

// A steady baseline session: 20 high IMA + 30 accel + 30 decel over 80 min = 1.0/min.
const baseRow = (date: string, over: Partial<MechRow> = {}): MechRow => ({
  date,
  imaHigh: 20,
  accelEfforts: 30,
  decelEfforts: 30,
  metabolicPeak: 45,
  metabolicAvg: 9,
  durationMin: 80,
  ...over,
});

describe("mechIntensityFor", () => {
  it("sums the three high-cost families ÷ minutes", () => {
    expect(mechIntensityFor(baseRow("2026-07-01"))).toBeCloseTo((20 + 30 + 30) / 80, 5);
  });

  it("skips a missing family rather than treating it as zero", () => {
    // Only accel + decel present → (30+30)/80, NOT (0+30+30)/80 (same here) — but a
    // null family must not pull the sum down: 60/80 either way, and imaHigh:null is fine.
    expect(mechIntensityFor(baseRow("2026-07-01", { imaHigh: null }))).toBeCloseTo(60 / 80, 5);
  });

  it("returns null with no duration (no divide-by-zero)", () => {
    expect(mechIntensityFor(baseRow("2026-07-01", { durationMin: null }))).toBeNull();
    expect(mechIntensityFor(baseRow("2026-07-01", { durationMin: 0 }))).toBeNull();
  });

  it("returns null when no count family is present", () => {
    expect(
      mechIntensityFor(baseRow("2026-07-01", { imaHigh: null, accelEfforts: null, decelEfforts: null })),
    ).toBeNull();
  });

  it("derives minutes from PlayerLoad ÷ load/min when session_duration_minutes is absent", () => {
    // durationMin null, but playerLoad 400 ÷ loadPerMin 5 = 80 min ⇒ (20+30+30)/80.
    const row = baseRow("2026-07-01", { durationMin: null, playerLoad: 400, loadPerMin: 5 });
    expect(mechIntensityFor(row)).toBeCloseTo(80 / 80, 5);
  });

  it("stored duration wins over the derived fallback when both are present", () => {
    const row = baseRow("2026-07-01", { durationMin: 80, playerLoad: 9999, loadPerMin: 1 });
    expect(mechIntensityFor(row)).toBeCloseTo(80 / 80, 5); // uses 80, not 9999
  });
});

describe("computeMechanicalPower", () => {
  it("classifies a spiked session as HIGH mechanical demand vs the player's norm", () => {
    // 5 baseline sessions at 1.0/min, then a 6th at ~1.6/min (well past +25%).
    const rows: MechRow[] = [
      baseRow("2026-07-01"),
      baseRow("2026-07-02"),
      baseRow("2026-07-03"),
      baseRow("2026-07-04"),
      baseRow("2026-07-05"),
      baseRow("2026-07-06", { imaHigh: 40, accelEfforts: 45, decelEfforts: 43 }), // 128/80 = 1.6
    ];
    const read = computeMechanicalPower(rows);
    expect(read.latest?.demand).toBe("high");
    expect(read.latest?.mechIndex ?? 0).toBeGreaterThan(100 + MECH_DEMAND_BAND);
    expect(read.confidence).toBe("medium"); // 6 mech sessions: mature (≥4) but not high (needs ≥8)
  });

  it("classifies a quiet session as LOW and a normal one as TYPICAL", () => {
    const rows: MechRow[] = [
      baseRow("2026-07-01"),
      baseRow("2026-07-02"),
      baseRow("2026-07-03"),
      baseRow("2026-07-04"),
      baseRow("2026-07-05", { imaHigh: 5, accelEfforts: 8, decelEfforts: 7 }), // 20/80 = 0.25 → LOW
      baseRow("2026-07-06"), // back to 1.0 → within band of the (now lower) mean → TYPICAL
    ];
    const read = computeMechanicalPower(rows);
    const low = read.history.find((s) => s.date === "2026-07-05");
    expect(low?.demand).toBe("low");
    expect(read.latest?.demand).toBe("typical");
  });

  it("surfaces peak metabolic power and its personal-norm index", () => {
    const rows: MechRow[] = [
      baseRow("2026-07-01", { metabolicPeak: 40 }),
      baseRow("2026-07-02", { metabolicPeak: 40 }),
      baseRow("2026-07-03", { metabolicPeak: 40 }),
      baseRow("2026-07-04", { metabolicPeak: 40 }),
      baseRow("2026-07-05", { metabolicPeak: 60 }), // 50% above the 44-avg
    ];
    const read = computeMechanicalPower(rows);
    expect(read.latest?.metabolicPeak).toBe(60);
    expect(read.latest?.metabolicPeakIndex ?? 0).toBeGreaterThan(100);
    expect(read.baseline.avgMetabolicPeak).toBeGreaterThan(0);
  });

  it("stays insufficient until the baseline is mature", () => {
    const rows: MechRow[] = Array.from({ length: MIN_MATURE_MECH_SESSIONS - 1 }, (_, i) =>
      baseRow(`2026-07-0${i + 1}`),
    );
    const read = computeMechanicalPower(rows);
    expect(read.latest?.demand).toBe("insufficient");
    expect(read.confidence).toBe("low");
  });

  it("never fabricates a value when metabolic peak is absent", () => {
    const read = computeMechanicalPower([
      baseRow("2026-07-01", { metabolicPeak: null }),
      baseRow("2026-07-02", { metabolicPeak: null }),
    ]);
    expect(read.latest?.metabolicPeak).toBeNull();
    expect(read.latest?.metabolicPeakIndex).toBeNull();
    expect(read.baseline.avgMetabolicPeak).toBeNull();
    expect(read.dataCoverage.hasMetabolicPeak).toBe(false);
  });
});

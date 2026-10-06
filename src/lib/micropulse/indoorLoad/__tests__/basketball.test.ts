import { describe, it, expect } from "vitest";
import { computeBasketballIndoorLoad, type BballLoadRow } from "../basketball";

function day(n: number): string {
  const d = new Date("2026-01-01T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** N sessions all at the same values → every per-component index is 100 (= the player's own norm). */
function flat(n: number, v: Partial<BballLoadRow>): BballLoadRow[] {
  return Array.from({ length: n }, (_, i) => ({
    date: day(i), playerLoad: null, highAccel: null, highDecel: null, highCod: null, jumps: null, ...v,
  }));
}

describe("computeBasketballIndoorLoad — Catapult (IMA) path unchanged", () => {
  it("scores an all-average session at 100 on PlayerLoad + Band-3 IMA + jumps; impacts null", () => {
    const rows = flat(8, { playerLoad: 500, highAccel: 10, highDecel: 8, highCod: 4, jumps: 20 });
    const out = computeBasketballIndoorLoad(rows);
    expect(out.latest?.score).toBe(100);
    expect(out.latest?.band).toBe("typical");
    expect(out.latest?.components.playerLoad).toBe(100);
    expect(out.latest?.components.highIntensityIma).toBe(100);
    expect(out.latest?.components.jumps).toBe(100);
    expect(out.latest?.components.impacts).toBeNull(); // Catapult doesn't report impacts
    expect(out.dataCoverage.hasImpacts).toBe(false);
    expect(out.dataCoverage.hasIma).toBe(true);
  });

  it("rows with no impacts key behave exactly as before (backward compatible)", () => {
    const rows: BballLoadRow[] = flat(6, { playerLoad: 400, highAccel: 5, highDecel: 5, highCod: 2, jumps: 10 });
    const out = computeBasketballIndoorLoad(rows);
    expect(out.latest?.components.impacts).toBeNull();
    expect(out.confidence).toBe("medium"); // mature + IMA present
  });
});

describe("computeBasketballIndoorLoad — Titan (impacts, no IMA) path", () => {
  const titan = flat(8, { playerLoad: 420, jumps: 18, impacts: 130 }); // no highAccel/decel/cod

  it("scores on PlayerLoad + impacts + jumps when there is no Band-3 IMA", () => {
    const out = computeBasketballIndoorLoad(titan);
    expect(out.latest?.score).toBe(100);
    expect(out.latest?.components.playerLoad).toBe(100);
    expect(out.latest?.components.impacts).toBe(100);
    expect(out.latest?.components.jumps).toBe(100);
    expect(out.latest?.components.highIntensityIma).toBeNull(); // Titan has no indoor IMA
    expect(out.dataCoverage.hasImpacts).toBe(true);
    expect(out.dataCoverage.hasIma).toBe(false);
    expect(out.baseline.avgImpacts).toBe(130);
  });

  it("impacts count as the mechanical signal for confidence (medium when mature)", () => {
    expect(computeBasketballIndoorLoad(titan).confidence).toBe("medium");
    // thin baseline (<6) stays low even with impacts
    expect(computeBasketballIndoorLoad(flat(3, { playerLoad: 420, jumps: 18, impacts: 130 })).confidence).toBe("low");
  });

  it("a heavier impacts/load day reads above the personal norm", () => {
    const rows = flat(6, { playerLoad: 400, jumps: 10, impacts: 100 });
    rows.push({ date: day(6), playerLoad: 560, highAccel: null, highDecel: null, highCod: null, jumps: 14, impacts: 150 });
    const out = computeBasketballIndoorLoad(rows);
    expect((out.latest?.score ?? 0)).toBeGreaterThan(110); // clearly above his average session
    expect(out.latest?.components.impacts).toBeGreaterThan(100);
  });
});

describe("renormalisation — impacts slots into the mechanical role cleanly", () => {
  it("an all-average session scores 100 whether the mechanical signal is IMA or impacts", () => {
    const cata = computeBasketballIndoorLoad(flat(8, { playerLoad: 500, highAccel: 10, jumps: 20 }));
    const titan = computeBasketballIndoorLoad(flat(8, { playerLoad: 500, impacts: 120, jumps: 20 }));
    expect(cata.latest?.score).toBe(100);
    expect(titan.latest?.score).toBe(100);
  });

  it("PlayerLoad-only team still scores (no mechanical signal, low confidence)", () => {
    const out = computeBasketballIndoorLoad(flat(8, { playerLoad: 500 }));
    expect(out.latest?.score).toBe(100);
    expect(out.confidence).toBe("low"); // no mechanical signal (neither IMA nor impacts)
  });
});

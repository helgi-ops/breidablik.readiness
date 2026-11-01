import { describe, it, expect } from "vitest";
import { computeKinexonDecel, type KinexonDecelDay } from "../index";

const REF = "2026-11-01";
function day(offset: number, over: Partial<KinexonDecelDay> = {}): KinexonDecelDay {
  const d = new Date(`${REF}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - offset);
  return { date: d.toISOString().slice(0, 10), decelsLoad: 1000, accelsLoad: 500, exertionsHigh: 40, mechLoad: 2000, playerLoad: 600, changesOfOrientation: 120, ...over };
}

describe("computeKinexonDecel", () => {
  it("steady load (with normal day-to-day variance) reads green overall", () => {
    // Small jitter so sd > 0 (identical values give sd 0 → z null → no_data).
    const jit = (i: number) => ({ decelsLoad: 1000 + ((i * 37) % 200) - 100, accelsLoad: 500 + ((i * 29) % 120) - 60, exertionsHigh: 40 + ((i * 7) % 10) - 5, mechLoad: 2000 + ((i * 53) % 300) - 150 });
    const rows = Array.from({ length: 21 }, (_, i) => day(i, jit(i)));
    const out = computeKinexonDecel(rows, REF);
    expect(out.overall).toBe("green");
    expect(out.dims.find((d) => d.key === "eccentric_load")!.flag).toBe("green");
  });

  it("a recent braking-load spike flags eccentric load", () => {
    const base = Array.from({ length: 20 }, (_, i) => day(i + 7, { decelsLoad: 1000 }));
    const recent = [0, 1, 2, 3, 4, 5, 6].map((o) => day(o, { decelsLoad: 2200 })); // well above norm
    const out = computeKinexonDecel([...base, ...recent], REF);
    expect(out.dims.find((d) => d.key === "eccentric_load")!.flag).toBe("red");
    expect(out.overall).toBe("red");
  });

  it("under-braking (decel:accel dropping below own norm) flags A:D balance", () => {
    // Baseline ratio ~2.0 (decel 1000 / accel 500); recent ratio ~1.0 (decel 600 / accel 600).
    const base = Array.from({ length: 20 }, (_, i) => day(i + 7, { decelsLoad: 1000, accelsLoad: 500 }));
    const recent = [0, 1, 2, 3, 4, 5, 6].map((o) => day(o, { decelsLoad: 600, accelsLoad: 600 }));
    const out = computeKinexonDecel([...base, ...recent], REF);
    expect(out.dims.find((d) => d.key === "ad_balance")!.flag).toBe("red");
  });

  it("returns no_data when there is no braking signal", () => {
    const rows = Array.from({ length: 10 }, (_, i) => day(i, { decelsLoad: null, accelsLoad: null, exertionsHigh: null, mechLoad: null, changesOfOrientation: null }));
    expect(computeKinexonDecel(rows, REF).overall).toBe("no_data");
  });
});

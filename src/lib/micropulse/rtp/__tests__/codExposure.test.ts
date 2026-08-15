import { describe, it, expect } from "vitest";
import {
  computeCodExposure,
  codLoadPerMin,
  COD_EXPOSURE_SUFFICIENT,
  type CodExposureRow,
} from "../codExposure";

// A healthy match-level session: 40 high-COD + 40 decel over 80 min = 1.0/min.
const row = (date: string, over: Partial<CodExposureRow> = {}): CodExposureRow => ({
  date,
  imaCodHigh: 40,
  decelEfforts: 40,
  durationMin: 80,
  ...over,
});

describe("codLoadPerMin", () => {
  it("sums high COD + decel ÷ minutes", () => {
    expect(codLoadPerMin(row("2026-07-01"))).toBeCloseTo(80 / 80, 5);
  });
  it("excludes sub-20-min sessions (rehab/warmup, inflated rate)", () => {
    expect(codLoadPerMin(row("2026-07-01", { durationMin: 15 }))).toBeNull();
  });
  it("derives minutes from PlayerLoad ÷ load/min when duration is absent", () => {
    expect(codLoadPerMin(row("2026-07-01", { durationMin: null, playerLoad: 400, loadPerMin: 5 }))).toBeCloseTo(80 / 80, 5);
  });
});

describe("computeCodExposure", () => {
  // Anchor "today" so the recent window is deterministic.
  const today = "2026-07-30";

  it("flags a returning player whose recent COD load is well below his match demand", () => {
    // Healthy baseline in June (~1.0/min match demand), then two weeks of light rehab (~0.2/min).
    const rows: CodExposureRow[] = [
      row("2026-06-01"), row("2026-06-05"), row("2026-06-09"), row("2026-06-13"), row("2026-06-17"),
      // recent (within 14d of 2026-07-30): light rehab sessions
      row("2026-07-20", { imaCodHigh: 8, decelEfforts: 8 }),   // 16/80 = 0.2
      row("2026-07-24", { imaCodHigh: 10, decelEfforts: 6 }),  // 16/80 = 0.2
    ];
    const read = computeCodExposure(rows, { today });
    expect(read.status).toBe("insufficient");
    expect(read.exposureRatio ?? 1).toBeLessThan(0.6);
    expect(read.baselinePerMin ?? 0).toBeGreaterThan(0.8);
  });

  it("passes a player whose recent session reached his match COD demand", () => {
    const rows: CodExposureRow[] = [
      row("2026-06-01"), row("2026-06-05"), row("2026-06-09"), row("2026-06-13"),
      row("2026-07-22", { imaCodHigh: 40, decelEfforts: 38 }), // 78/80 ≈ 0.975 ≈ baseline
    ];
    const read = computeCodExposure(rows, { today });
    expect(read.status).toBe("sufficient");
    expect(read.exposureRatio ?? 0).toBeGreaterThanOrEqual(COD_EXPOSURE_SUFFICIENT);
  });

  it("labels a mid-progression player as building", () => {
    const rows: CodExposureRow[] = [
      row("2026-06-01"), row("2026-06-05"), row("2026-06-09"), row("2026-06-13"),
      row("2026-07-25", { imaCodHigh: 30, decelEfforts: 28 }), // 58/80 ≈ 0.725 → ~0.72 ratio
    ];
    const read = computeCodExposure(rows, { today });
    expect(read.status).toBe("building");
  });

  it("no_data when the baseline is too thin or there is no recent session", () => {
    expect(computeCodExposure([row("2026-06-01"), row("2026-06-05")], { today }).status).toBe("no_data");
    // Mature baseline but nothing in the recent window → no recent peak → no ratio.
    const old = ["2026-06-01", "2026-06-05", "2026-06-09", "2026-06-13"].map((d) => row(d));
    expect(computeCodExposure(old, { today }).status).toBe("no_data");
  });
});
